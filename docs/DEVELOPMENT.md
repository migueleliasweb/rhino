# Rhino Developer Guide

This guide covers setting up your local environment, building, running tests, and extending Rhino.

---

## 1. Prerequisites

- **Go**: Version 1.25 or later.
- **Buf CLI**: Version 1.50+ (installed at `buf` in PATH).
- **Protoc Plugins**:
  - `protoc-gen-go` (`go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`)
  - `protoc-gen-connect-go` (`go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest`)

---

## 2. Repository Layout

```
rhino/
├── main.go                      # Application main entrypoint
├── cmd/                         # CLI commands (Cobra & Viper)
│   ├── rhino/main.go            # Standalone CLI binary entrypoint
│   ├── root.go                  # Root command & configuration loading
│   ├── serve.go                 # 'serve' command implementing the daemon
│   └── version.go               # 'version' command
├── internal/                    # Internal engine & business logic
│   ├── hypervisor/              # Libvirt driver abstraction
│   │   ├── client.go            # HypervisorClient interface & models
│   │   ├── golibvirt.go         # Production driver (digitalocean/go-libvirt)
│   │   └── mock.go              # In-memory mock driver (macOS & testing)
│   ├── service/                 # Connect RPC service implementations
│   │   ├── vm_service.go        # VM lifecycle & telemetry streaming
│   │   ├── host_service.go      # Host resource discovery
│   │   ├── hardware_service.go  # Hardware mutations (disks, NICs, PCI)
│   │   └── service_test.go      # End-to-end service integration tests
│   └── xml/                     # libvirt-go-xml typed AST parser & generator
│       ├── transformer.go       # AST transformations & device builders
│       └── transformer_test.go  # XML unit tests
├── proto/                       # Protobuf schema definitions
│   └── rhino/v1/
│       ├── vm.proto
│       ├── host.proto
│       └── hardware.proto
├── server/
│   └── gen/                     # Generated Go code from Protobuf
│       └── proto/go/
├── docs/                        # Architecture, CLI, and API documentation
└── plan/                        # Engineering roadmap & phased task plans
```

---

## 3. Building & Running

### Build Binary

```bash
go build -o bin/rhino .
```

### Run on macOS (Mock Driver)

On macOS, Rhino defaults to the in-memory `mock` driver. It runs entirely without CGo, libvirt headers, or root permissions:

```bash
./bin/rhino serve --addr :8080 --driver mock
```

The mock driver is pre-seeded with sample virtual machines (`ubuntu-dev`, `win11-gaming` with a passed-through GPU, `alpine-router`), storage pools, virtual networks, host PCI devices, and simulated telemetry counters.

### Run Against Live Linux KVM

When running on Linux (or connecting to a remote Linux hypervisor):

```bash
# Direct local Unix domain socket:
./bin/rhino serve --driver libvirt --libvirt-sock /var/run/libvirt/libvirt-sock

# Connecting to a remote KVM host over SSH tunnel:
# 1. Forward remote libvirt socket locally:
ssh -L /tmp/remote-libvirt.sock:/var/run/libvirt/libvirt-sock user@hypervisor-host

# 2. Point Rhino to the forwarded socket:
./bin/rhino serve --driver libvirt --libvirt-sock /tmp/remote-libvirt.sock
```

---

## 4. Testing Standards (Mandatory `-race` Flag)

> [!IMPORTANT]
> **Always run tests with the `-race` flag** (`go test -v -race ./...`).
> Makefiles are prohibited in this repository; use standard `go` commands directly.

Rhino handles continuous concurrent telemetry streaming, mutex-guarded driver state changes, and live hypervisor connections. The Go race detector must pass cleanly on all test runs:

```bash
# Run all tests with race detector enabled:
go test -v -race ./...

# Run tests for a specific package:
go test -v -race ./internal/service/...
go test -v -race ./internal/xml/...
```

---

## 5. Protobuf Code Generation

Whenever modifying or adding `.proto` files under `proto/`:

```bash
# 1. Validate proto schemas
buf lint

# 2. Re-generate Go Connect RPC stubs
buf generate

# 3. Verify tests pass with new schemas
go test -v -race ./...
```
