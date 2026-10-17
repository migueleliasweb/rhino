# Go Development & Testing Rules

- **Do NOT create Makefiles**: Never generate or commit `Makefile` files to this repository. Always use standard `go` and `buf` CLI commands directly (`go test -v -race ./...`, `go build -o bin/rhino .`, `buf generate`).
- **Always run tests with `-race`**: All test executions (`go test`) must include the `-race` flag (`go test -v -race ./...`) to actively detect race conditions in concurrent streaming and state mutations.
- **Never ignore data race warnings**: Any data race detected by the Go race detector must be treated as a blocker and resolved before proceeding.
