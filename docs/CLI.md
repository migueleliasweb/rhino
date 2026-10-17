# Rhino CLI Reference

Rhino provides a command-line interface powered by [Cobra](https://github.com/spf13/cobra) and [Viper](https://github.com/spf13/viper) with full support for CLI flags, environment variables, and configuration files.

---

## 1. Quick Start

Run the Rhino daemon with default settings:

```bash
# Build binary
go build -o bin/rhino .

# Run daemon
./bin/rhino serve
```

If no subcommand is passed, `rhino` automatically launches the `serve` command.

---

## 2. Global Flags & Configuration File

All subcommands support the global `--config` flag:

```bash
./bin/rhino --config /path/to/custom-config.yaml serve
```

By default, Rhino searches for a `rhino.yaml` file in the current working directory.

### Sample `rhino.yaml`

```yaml
addr: ":8080"
driver: "mock"                 # "mock" or "libvirt"
libvirt-sock: "/var/run/libvirt/libvirt-sock"
auth-token: "super-secret-token"
```

---

## 3. Environment Variables

Every CLI flag can be configured using environment variables prefixed with `RHINO_`. Hyphens and dots are automatically replaced with underscores.

| Flag | Environment Variable | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `--addr` | `RHINO_ADDR` | `:8080` | TCP address/port for HTTP/Connect RPC server |
| `--driver` | `RHINO_DRIVER` | `mock` (macOS), `libvirt` (Linux) | Hypervisor driver (`mock` or `libvirt`) |
| `--libvirt-sock` | `RHINO_LIBVIRT_SOCK` | `/var/run/libvirt/libvirt-sock` | Unix domain socket path for libvirt daemon |
| `--auth-token` | `RHINO_AUTH_TOKEN` | `""` (disabled) | Optional Bearer token for authenticating API requests |
| `--config` | — | `./rhino.yaml` | Path to custom YAML configuration file |

Precedence order:
1. Explicit CLI command-line flag
2. Environment variable (`RHINO_*`)
3. Configuration file (`rhino.yaml`)
4. Built-in default

---

## 4. Commands

### `rhino serve`

Starts the HTTP/2 and gRPC-Web Connect RPC daemon and live telemetry streaming engine.

```bash
./bin/rhino serve [flags]
```

**Flags**:
- `--addr string`: HTTP/Connect listen address (default: `:8080`).
- `--driver string`: Hypervisor driver, `mock` or `libvirt` (default: `mock` on macOS, `libvirt` on Linux).
- `--libvirt-sock string`: Path to libvirt unix socket (default: `/var/run/libvirt/libvirt-sock`).
- `--auth-token string`: Optional bearer authentication token. When configured, incoming requests (except `/healthz`) require an `Authorization: Bearer <token>` header.

**Examples**:

```bash
# Run on custom port with in-memory mock driver
./bin/rhino serve --addr :9000 --driver mock

# Run against a local Linux libvirt socket with token auth
./bin/rhino serve --driver libvirt --libvirt-sock /var/run/libvirt/libvirt-sock --auth-token mysecret

# Run using environment variables
export RHINO_ADDR=":8080"
export RHINO_DRIVER="libvirt"
./bin/rhino serve
```

### `rhino version`

Prints the current version, git commit, build timestamp, and runtime OS/architecture.

```bash
./bin/rhino version
# Output: Rhino v0.1.0-dev (none) built at unknown [darwin/arm64]
```

### `rhino completion`

Generates shell completion scripts for `bash`, `zsh`, `fish`, or `powershell`.

```bash
# For zsh:
./bin/rhino completion zsh > ~/.oh-my-zsh/completions/_rhino
```
