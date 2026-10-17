package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cfgFile string

var rootCmd = &cobra.Command{
	Use:   "rhino",
	Short: "Rhino is a visual node-based hypervisor manager for libvirt & KVM",
	Long: `Rhino provides an intuitive visual node-based web UI and high-performance
Connect RPC API for modern virtual machine orchestration on libvirt & KVM.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Default action when run without subcommands: start the server
		return serveCmd.RunE(cmd, args)
	},
}

// Execute adds all child commands to the root command and sets flags appropriately.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is ./rhino.yaml)")

	// Add subcommands
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(versionCmd)
}

func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		viper.AddConfigPath(".")
		viper.SetConfigType("yaml")
		viper.SetConfigName("rhino")
	}

	viper.SetEnvPrefix("RHINO")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	viper.AutomaticEnv()

	// If config file is found, read it
	_ = viper.ReadInConfig()
}
