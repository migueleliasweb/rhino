package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/rs/cors"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1/rhinov1connect"
	"github.com/migueleliasweb/rhino/internal/hypervisor"
	"github.com/migueleliasweb/rhino/internal/service"
	"github.com/migueleliasweb/rhino/web"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the Rhino Connect RPC daemon and HTTP server",
	Long:  `Runs the high-performance Connect RPC API server and serves telemetry streams.`,
	RunE:  runServe,
}

func init() {
	defaultDriver := "mock"
	if runtime.GOOS == "linux" {
		defaultDriver = "libvirt"
	}

	serveCmd.Flags().String("addr", ":8080", "HTTP/Connect listen address (env: RHINO_ADDR)")
	serveCmd.Flags().String("driver", defaultDriver, "Hypervisor driver: 'mock' or 'libvirt' (env: RHINO_DRIVER)")
	serveCmd.Flags().String("libvirt-sock", "/var/run/libvirt/libvirt-sock", "Path to libvirt unix socket (env: RHINO_LIBVIRT_SOCK)")
	serveCmd.Flags().String("auth-token", "", "Optional bearer authentication token (env: RHINO_AUTH_TOKEN)")

	_ = viper.BindPFlag("addr", serveCmd.Flags().Lookup("addr"))
	_ = viper.BindPFlag("driver", serveCmd.Flags().Lookup("driver"))
	_ = viper.BindPFlag("libvirt-sock", serveCmd.Flags().Lookup("libvirt-sock"))
	_ = viper.BindPFlag("auth-token", serveCmd.Flags().Lookup("auth-token"))
}

func runServe(_ *cobra.Command, _ []string) error {
	addr := viper.GetString("addr")
	driverType := viper.GetString("driver")
	socketPath := viper.GetString("libvirt-sock")
	authToken := viper.GetString("auth-token")

	log.Printf("[rhino] Starting Rhino daemon (OS=%s, Driver=%s, Addr=%s)...", runtime.GOOS, driverType, addr)

	var client hypervisor.HypervisorClient
	var err error

	switch driverType {
	case "libvirt":
		log.Printf("[rhino] Connecting to live libvirt daemon at %s...", socketPath)
		client, err = hypervisor.NewGoLibvirtClient(hypervisor.Config{
			Network: "unix",
			Address: socketPath,
			Timeout: 5 * time.Second,
		})
		if err != nil {
			log.Printf("[rhino] WARNING: Failed to connect to libvirt socket: %v", err)
			log.Printf("[rhino] Falling back to in-memory mock driver...")
			client = hypervisor.NewMockClient()
		}
	default:
		log.Printf("[rhino] Using in-memory mock hypervisor driver.")
		client = hypervisor.NewMockClient()
	}
	defer client.Close()

	mux := http.NewServeMux()

	// Register Connect RPC Handlers
	vmHandler := service.NewVMServiceHandler(client)
	vmPath, vmHttpHandler := rhinov1connect.NewVMServiceHandler(vmHandler)
	mux.Handle(vmPath, vmHttpHandler)

	hostHandler := service.NewHostServiceHandler(client)
	hostPath, hostHttpHandler := rhinov1connect.NewHostServiceHandler(hostHandler)
	mux.Handle(hostPath, hostHttpHandler)

	hardwareHandler := service.NewHardwareServiceHandler(client)
	hwPath, hwHttpHandler := rhinov1connect.NewHardwareServiceHandler(hardwareHandler)
	mux.Handle(hwPath, hwHttpHandler)

	// Health check endpoint
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	// Embedded Web SPA static asset & fallback handler
	mux.Handle("/", web.Handler())

	var rootHandler http.Handler = mux

	// Optional Bearer Token Authentication Middleware
	if authToken != "" {
		log.Printf("[rhino] Bearer token authentication enabled.")
		prevHandler := rootHandler
		rootHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" {
				prevHandler.ServeHTTP(w, r)
				return
			}
			authHeader := r.Header.Get("Authorization")
			expected := "Bearer " + authToken
			if authHeader != expected {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			prevHandler.ServeHTTP(w, r)
		})
	}

	// Configure CORS for web client integration
	corsHandler := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept",
			"Content-Type",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"X-User-Agent",
			"X-Grpc-Web",
			"Authorization",
		},
		ExposedHeaders: []string{
			"Grpc-Status",
			"Grpc-Message",
			"Grpc-Status-Details-Bin",
		},
		MaxAge: int(2 * time.Hour / time.Second),
	}).Handler(rootHandler)

	// Wrap in h2c for HTTP/2 cleartext (required by gRPC and efficient for Connect RPC streaming)
	h2cHandler := h2c.NewHandler(corsHandler, &http2.Server{})

	server := &http.Server{
		Addr:              addr,
		Handler:           h2cHandler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[rhino] Listening on http://localhost%s", addr)
		log.Printf("[rhino] Registered RPC Endpoints:")
		log.Printf("  -> %s", vmPath)
		log.Printf("  -> %s", hostPath)
		log.Printf("  -> %s", hwPath)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[rhino] Server failed: %v", err)
		}
	}()

	<-stopChan
	log.Printf("[rhino] Shutting down gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[rhino] Shutdown error: %v", err)
	}
	fmt.Println("[rhino] Daemon exited cleanly.")
	return nil
}
