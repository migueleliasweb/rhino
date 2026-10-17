# Go Testing Rules

- **Always run tests with `-race`**: All test executions (`go test`) must include the `-race` flag (e.g. `go test -v -race ./...` or `make test`) to actively detect race conditions in concurrent streaming and state mutations.
- **Never ignore data race warnings**: Any data race detected by the Go race detector must be treated as a blocker and resolved before proceeding.
