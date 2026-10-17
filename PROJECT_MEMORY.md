# Rhino — Project Memory & Context

This document captures operational context, implementation nuances, rationale, and deferred features discussed during architectural planning that extend beyond the high-level [ARCHITECTURE.md](file:///Users/miguel.santos/Projects/personal/rhino/ARCHITECTURE.md).

---

## 1. Development & Host Environment Context

- **Developer Workstation**: macOS (darwin).
- **Target Deployment**: Linux hypervisors running `libvirtd` / `virtqemud` (KVM/QEMU).
- **Driver Decision Rationale (`digitalocean/go-libvirt` vs CGo `libvirt-go`)**:
  - `digitalocean/go-libvirt` was chosen for zero CGo dependencies. This avoids requiring `libvirt-dev` C headers or `pkg-config` on macOS, and eliminates cross-compilation toolchains (`zig cc` / cross-glibc) when building Linux binaries from macOS.
  - **Compartmentalization Requirement**: The hypervisor interactions must remain strictly behind an internal Go interface (`HypervisorClient`). If deep libvirt C API capabilities or newer event types become necessary in production, the driver implementation can be swapped without touching the Connect RPC layer or business logic.
- **Local Development without Live KVM**:
  - A mock implementation of `HypervisorClient` (e.g. `mock.go` with canned domain XMLs and simulated CPU/RAM telemetry counters) must be provided so frontend and backend development can run locally on macOS without needing a live Linux hypervisor attached.
  - For testing against real KVM from macOS: Rhino can connect to a remote Linux host via SSH tunnel forwarding `/var/run/libvirt/libvirt-sock` or via TCP/TLS.

---

## 2. Node Graph & XML State Synchronization Nuances

- **Deterministic Node Identification**:
  - React Flow nodes representing libvirt devices must have deterministic, collision-free IDs derived from the device properties:
    - Core: `vm-core`
    - Disks: `disk-<target_dev>` (e.g. `disk-vda`, `disk-sda`, `disk-hdc`)
    - Interfaces: `interface-<mac_or_pci>` (e.g. `interface-52:54:00:12:34:56`)
    - Hostdevs: `hostdev-<domain>_<bus>_<slot>_<function>` (e.g. `hostdev-0000_01_00_0`)
  - **Why**: When switching between the visual canvas and the Raw XML editor, this deterministic mapping allows the canvas to re-parse the XML AST and update existing node properties without resetting user node coordinates or destroying the canvas layout.
- **Visual Diff & Draft State Mechanics**:
  - The frontend maintains two state trees: `baseDomain` (last committed state from libvirt) and `draftDomain` (current modifications on the canvas).
  - Wires connecting newly spawned capability nodes are marked with a staged addition edge type (e.g., animated dashed border, green accent).
  - Removing a capability node or wire does not immediately call `DetachDevice`; it marks the edge as a staged deletion (e.g., red dashed stroke).
  - An "Unsaved Changes" toolbar displays the diff count with `Discard` and `Apply Changes` actions.
- **Libvirt Mutation Flags (`--live` vs `--config`)**:
  - Stopped VMs: Mutations apply directly with `VIR_DOMAIN_AFFECT_CONFIG`.
  - Running VMs:
    - Backend analyzes the diff against supported hotplug device types:
      - VirtIO Disks / SCSI disks: hotpluggable via `DomainAttachDeviceFlags` with `VIR_DOMAIN_AFFECT_LIVE | VIR_DOMAIN_AFFECT_CONFIG`.
      - VirtIO NICs: hotpluggable via `DomainAttachDeviceFlags`.
      - vCPU / Memory ballooning: dynamic via `DomainSetVcpusFlags` / `DomainSetMemoryFlags`.
      - PCI Hostdev / CPU topology / Firmware changes: cannot hotplug safely; applied to `CONFIG` only and flagged to the frontend with a `reboot_required: true` response field.

---

## 3. Search-to-Capability (`Cmd+K`) Interaction Flow

- Pressing `Cmd+K` or clicking "Add Hardware" triggers the search palette with categorized device templates.
- **Interactive Configuration Modal**:
  - Instead of dropping a blank, unconfigured node onto the canvas, selecting an option (e.g. "Dedicated GPU" or "Network Interface") opens a focused dialog.
  - The dialog queries the backend Host Discovery RPCs:
    - *Storage*: Queries `ListStoragePools` and `ListStorageVolumes` for available ISOs or disk volumes.
    - *Network*: Queries `ListNetworks` for available virtual networks (`default`) and bridge interfaces (`br0`).
    - *PCI Passthrough*: Queries `ListNodeDevices` filtered for PCI display controllers and audio devices, displaying human-readable vendor names (e.g., "NVIDIA Corporation AD104 [GeForce RTX 4070]").
  - Upon clicking "Add to VM", the node is spawned onto the canvas already wired to the VM Core in the "staged addition" state.

---

## 4. Telemetry Streaming Architecture

- Uses Connect RPC Server Streaming (`StreamTelemetry(StreamTelemetryRequest) returns (stream TelemetryUpdate)`).
- **Subscription Lifecycle**:
  - When viewing the Global Topology view: Client requests low-frequency updates (`interval_ms: 2000`) containing high-level domain state and aggregate CPU/RAM percentages for all VMs.
  - When drilled into an active VM canvas: Client requests high-frequency updates (`interval_ms: 1000`) for that specific VM, returning detailed telemetry (per-vCPU utilization, active vs allocated memory, disk read/write throughput, network tx/rx throughput).
  - Stream context cancellation in Go: Ensures when the user navigates away or closes the browser tab, the streaming goroutine on the Go server immediately terminates and releases hypervisor polling resources.

---

## 5. Deferred Features & Backlog

These capabilities were intentionally deferred during `/grill-me` alignment to ensure a tight, high-quality MVP:

1. **Console & Display (Post-MVP)**:
   - Built-in Go WebSocket proxy to support:
     - Graphical Desktop: noVNC embedded iframe / canvas communicating to libvirt's VNC socket.
     - Serial Terminal: `xterm.js` communicating over a Connect RPC byte stream or WebSocket to libvirt's serial/console stream API (`DomainOpenConsole`).
2. **Additional Capability Nodes (Post-MVP)**:
   - **Shared Folders (VirtioFS / 9p)**: Host directory pass-through with mount tag configuration.
   - **Cloud-Init / Metadata Drive**: Auto-generating a NoCloud ISO (user-data, meta-data, network-config) attached as a virtual CD-ROM.
   - **vTPM 2.0**: Emulated TPM device (`swtpm`) for Windows 11 / Secure Boot compliance.
   - **USB Passthrough**: Host USB device passthrough based on vendor/product ID.
   - **Storage Volume Management**: In-app creation and resizing of QCOW2 images within storage pools.
3. **Advanced Escape Hatch Features**:
   - Side-by-side XML Diff Viewer comparing live hypervisor XML with draft changes.
   - XML syntax validation warnings in real-time using `libvirt-go-xml` unmarshaling before submission.

---

## 6. Tooling & Build Conventions

- **Buf CLI (`buf`)**:
  - Used for linting, breaking change detection, and generating both Go and TypeScript code from `proto/`.
  - Go plugins: `protoc-gen-go`, `protoc-gen-connect-go`.
  - TS plugins: `@bufbuild/protoc-gen-es`, `@connectrpc/protoc-gen-connect-es`.
- **Testing Standard**:
  - **Always run tests with the `-race` flag** (`go test -v -race ./...` or `make test`).
  - This is mandatory to prevent and detect race conditions across concurrent Connect RPC streams, ticker loops, hypervisor driver calls, and mock state synchronizations.
- **Packaging**:
  - Single binary build: `go build -o bin/rhino .` with `//go:embed` targeting `web/dist`.
  - Dev workflow: Vite dev server with proxy to Go backend running on `:8080` (enabling hot module replacement).
