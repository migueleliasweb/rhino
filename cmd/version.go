package cmd

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

// Version information populated at build time or defaults
var (
	Version   = "v0.1.0-dev"
	GitCommit = "none"
	BuildDate = "unknown"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the Rhino version and build information",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Printf("Rhino %s (%s) built at %s [%s/%s]\n",
			Version, GitCommit, BuildDate, runtime.GOOS, runtime.GOARCH)
	},
}
