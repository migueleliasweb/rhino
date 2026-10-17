package web

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
)

//go:embed all:dist
var distFS embed.FS

// getTargetFS returns an fs.FS from local disk if available during development,
// or falls back to the embedded binary filesystem.
func getTargetFS() fs.FS {
	// 1. Check if running from repository root with live web/dist on disk
	if info, err := os.Stat("web/dist"); err == nil && info.IsDir() {
		return os.DirFS("web/dist")
	}

	// 2. Check if running from within the web/ directory with live dist on disk
	if info, err := os.Stat("dist"); err == nil && info.IsDir() {
		return os.DirFS("dist")
	}

	// 3. Fallback to embedded filesystem
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil
	}
	return sub
}

// Handler returns an http.Handler that serves the SPA frontend with fallback to index.html.
// During development, it dynamically serves from disk so file updates are immediate.
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetFS := getTargetFS()
		if targetFS == nil {
			http.NotFound(w, r)
			return
		}

		fileServer := http.FileServer(http.FS(targetFS))
		path := r.URL.Path

		if path == "" || path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try opening the asset directly
		cleanPath := path[1:]
		if f, err := targetFS.Open(cleanPath); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Fallback to index.html for client-side routing
		r2 := new(http.Request)
		*r2 = *r
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	})
}
