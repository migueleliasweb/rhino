# Rhino Implementation Plan

## Overview

This document outlines the detailed step-by-step execution plan for **Rhino**, prioritizing the **Backend & API Engine (Phase 1)** before proceeding to the Web/Frontend layers.

---

## Phase 1: API & Backend Core Engine (Active)

### Goal
Build a standalone, robust Go backend using Connect RPC, `digitalocean/go-libvirt`, and `libvirt-go-xml` that provides domain lifecycle management, host discovery, device mutation primitives, and real-time telemetry streaming, backed by an in-memory mock driver for local macOS development.

---

### Step 1.1: Project Setup & Tooling Configuration
- [ ] Initialize Go module `github.com/migueleliasweb/rhino` (`go.mod`).
- [ ] Configure `buf.yaml` (v2) specifying module name and proto dependencies.
- [ ] Configure `buf.gen.yaml` targeting Go plugins:
  - `protoc-gen-go`
  - `protoc-gen-connect-go`
- [ ] Setup Makefile or task runner for `make proto`, `make test`, `make run`.

### Step 1.2: Protobuf Schema Design (`proto/rhino/v1/`)
- [ ] **`vm.proto`**:
  - `VMService`:
    - `ListDomains(ListDomainsRequest) returns (ListDomainsResponse)`: Returns all active/inactive domains with core metadata (UUID, Name, State, vCPUs, Memory).
    - `GetDomain(GetDomainRequest) returns (GetDomainResponse)`: Returns detailed domain breakdown including typed device topology.
    - `StartDomain(StartDomainRequest) returns (StartDomainResponse)`
    - `StopDomain(StopDomainRequest) returns (StopDomainResponse)`: Supports graceful shutdown and force-off (`destroy`).
    - `DeleteDomain(DeleteDomainRequest) returns (DeleteDomainResponse)`: Undefines domain with option to remove associated storage volumes.
    - `StreamTelemetry(StreamTelemetryRequest) returns (stream TelemetryUpdate)`: Server-streaming RPC pushing live CPU, memory, and I/O metrics at requested intervals.
    - `GetDomainXML(GetDomainXMLRequest) returns (GetDomainXMLResponse)`: Raw XML escape hatch.
    - `UpdateDomainXML(UpdateDomainXMLRequest) returns (UpdateDomainXMLResponse)`: Raw XML escape hatch update with dry-run validation.
- [ ] **`host.proto`**:
  - `HostService`:
    - `ListStoragePools(ListStoragePoolsRequest) returns (ListStoragePoolsResponse)`: Returns pools and contained volumes/ISOs.
    - `ListNetworks(ListNetworksRequest) returns (ListNetworksResponse)`: Returns virtual networks (NAT/routed) and host bridge interfaces.
    - `ListNodeDevices(ListNodeDevicesRequest) returns (ListNodeDevicesResponse)`: Returns host PCI devices (GPUs, NICs) with vendor/device descriptors.
    - `GetHostInfo(GetHostInfoRequest) returns (GetHostInfoResponse)`: Host CPU, RAM, and virtualization hypervisor details.
- [ ] **`hardware.proto`**:
  - `HardwareService`:
    - `AttachDevice(AttachDeviceRequest) returns (AttachDeviceResponse)`: Validates device specification, hotplugs if running and supported, otherwise stages to config; reports `reboot_required`.
    - `DetachDevice(DetachDeviceRequest) returns (DetachDeviceResponse)`: Detaches device with live/config flags.
    - `UpdateDevice(UpdateDeviceRequest) returns (UpdateDeviceResponse)`: Modifies device configuration.

### Step 1.3: Hypervisor Driver Layer (`server/internal/hypervisor/`)
- [ ] **Interface Definition (`client.go`)**:
  - Decouple all RPC services from driver specifics via `HypervisorClient`:
    - `ListDomains(ctx context.Context) ([]DomainSummary, error)`
    - `GetDomainXML(ctx context.Context, nameOrUUID string) (string, error)`
    - `DefineDomainXML(ctx context.Context, xmlStr string) (string, error)`
    - `StartDomain(ctx context.Context, nameOrUUID string) error`
    - `StopDomain(ctx context.Context, nameOrUUID string, force bool) error`
    - `DeleteDomain(ctx context.Context, nameOrUUID string, removeDisks bool) error`
    - `AttachDevice(ctx context.Context, nameOrUUID string, deviceXML string, live, config bool) error`
    - `DetachDevice(ctx context.Context, nameOrUUID string, deviceXML string, live, config bool) error`
    - `GetDomainStats(ctx context.Context, nameOrUUID string) (*DomainMetrics, error)`
    - `ListStoragePools(ctx context.Context) ([]StoragePoolSummary, error)`
    - `ListNetworks(ctx context.Context) ([]NetworkSummary, error)`
    - `ListNodeDevices(ctx context.Context, capType string) ([]NodeDeviceSummary, error)`
- [ ] **Production Driver (`golibvirt.go`)**:
  - Connects to `/var/run/libvirt/libvirt-sock` or TCP socket via `digitalocean/go-libvirt`.
  - Implements translation between `go-libvirt` RPC calls and `HypervisorClient` models.
- [ ] **In-Memory Mock Driver (`mock.go`)**:
  - Contains canned, realistic libvirt domain XMLs (Ubuntu Server, Windows 11 with GPU, Debian minimal).
  - Simulates domain state transitions (stopped -> starting -> running -> stopping).
  - Emits synthetic, oscillating CPU and RAM telemetry for streaming validation.
  - Enables full development, testing, and CI execution on macOS without KVM headers or root privileges.

### Step 1.4: XML Transformation & Diff Engine (`server/internal/xml/`)
- [ ] Use `libvirt.org/go/libvirtxml`:
  - `ParseDomain(xmlStr string) (*libvirtxml.Domain, error)`
  - `SerializeDomain(dom *libvirtxml.Domain) (string, error)`
  - Helper functions to extract structured device models:
    - Disks (`DomainDisk`) -> Protobuf `DiskDevice`
    - Interfaces (`DomainInterface`) -> Protobuf `NetworkInterfaceDevice`
    - Hostdevs (`DomainHostdev`) -> Protobuf `PCIDevice`
    - Memory & vCPU allocation -> Protobuf `ComputeConfig`
  - Hotplug compatibility analyzer: inspects device type and determines whether live hotplug is permissible in QEMU.

### Step 1.5: Connect RPC Service Implementations (`server/internal/service/`)
- [ ] Implement `VMServiceHandler` (`vm_service.go`).
- [ ] Implement `HostServiceHandler` (`host_service.go`).
- [ ] Implement `HardwareServiceHandler` (`hardware_service.go`).
- [ ] Implement context-aware telemetry streaming loop with tickers and graceful termination on client disconnect.
- [ ] Implement HTTP server entrypoint in `server/cmd/rhino/main.go` with CORS support for local development.

### Step 1.6: Automated Testing & Verification
- [ ] Unit tests for XML parsing and device extraction (`xml_test.go`).
- [ ] Service integration tests running against `MockClient` (`service_test.go`).
- [ ] End-to-end verification via `buf curl` or HTTP client verifying unary and streaming calls.

---

## Phase 2: Web Frontend & Visual Canvas

- [ ] Initialize React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui.
- [ ] Setup `@connectrpc/connect-web` and `@connectrpc/connect-query` using generated Protobuf TypeScript client.
- [ ] Implement global application layout (header, sidebar with VM list, status indicators).
- [ ] Implement `@xyflow/react` canvas:
  - Custom `VmCoreNode` with live telemetry gauges (CPU %, RAM, uptime, IP).
  - Custom capability nodes (`[Storage]`, `[Network]`, `[Compute]`, `[PCI Hostdev]`) with distinct group badges and names.
  - Interactive handles and wire routing.
- [ ] Connect `StreamTelemetry` hook to update the canvas in real time.

---

## Phase 3: Search-to-Capability & Mutation Engine

- [ ] Implement `Cmd+K` command palette.
- [ ] Connect palette to `HostService` endpoints to show discovered storage pools, bridges, and host PCI devices.
- [ ] Implement modal flow: selecting device -> configuring parameters -> spawning auto-wired node in staged state.
- [ ] Implement visual diff edge rendering (green dashed animated for staged additions, red dashed for staged deletions).
- [ ] Implement "Draft & Commit" toolbar with "Apply Changes" button calling `AttachDevice`/`DetachDevice`.
- [ ] Show "Reboot Required" notification for non-hotpluggable staged changes.

---

## Phase 4: Creation Wizard & XML Escape Hatch

- [ ] Build Minimal Creation Wizard modal (Name, vCPUs, RAM, Boot ISO picker).
- [ ] Embed Monaco or CodeMirror editor with bidirectional buffer sync to canvas.
- [ ] Bundle frontend SPA into single Go binary using `//go:embed`.

---

## Phase 5: Advanced Topology & Console

- [ ] Global macro canvas connecting multiple VMs to virtual networks and storage pools.
- [ ] Built-in Go WebSocket proxy multiplexing noVNC and xterm.js serial console.
