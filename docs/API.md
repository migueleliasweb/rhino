# Rhino Connect RPC API Reference

Rhino exposes a type-safe RPC API using [Connect RPC](https://connectrpc.com/). Endpoints can be called using standard HTTP/1.1 or HTTP/2 POST requests with JSON or binary Protobuf, as well as native gRPC and gRPC-Web clients.

Base URL: `http://localhost:8080` (or configured `--addr`)

---

## 1. Protocol & Headers

Every Connect RPC request must send:
- **HTTP Method**: `POST`
- **Content-Type**: `application/json` (or `application/proto`)
- **Headers (Optional)**:
  - `Authorization: Bearer <token>` (if `--auth-token` is configured)
  - `Connect-Protocol-Version: 1`

### Health Check

```bash
curl http://localhost:8080/healthz
# Response: OK (HTTP 200)
```

---

## 2. Services Overview

| Service | RPC Path | Description |
| :--- | :--- | :--- |
| **`VMService`** | `/rhino.v1.VMService/*` | Domain lifecycle, inspection, raw XML, and telemetry streaming |
| **`HostService`** | `/rhino.v1.HostService/*` | Host resource discovery (pools, volumes, bridges, PCI devices) |
| **`HardwareService`** | `/rhino.v1.HardwareService/*` | Virtual disk, vNIC, and PCI hostdev attachments and mutations |

---

## 3. `rhino.v1.VMService`

### `ListDomains`
Lists active and inactive domains.

- **Endpoint**: `POST /rhino.v1.VMService/ListDomains`
- **Request**:
```json
{
  "includeInactive": true
}
```
- **Response**:
```json
{
  "domains": [
    {
      "uuid": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "ubuntu-dev",
      "id": 1,
      "state": "DOMAIN_STATE_RUNNING",
      "vcpus": 4,
      "memoryKib": "8388608",
      "maxMemoryKib": "16777216",
      "autostart": true,
      "osType": "hvm",
      "arch": "x86_64"
    }
  ]
}
```

### `GetDomain`
Retrieves a detailed domain breakdown including typed device topology extracted from the libvirt XML AST.

- **Endpoint**: `POST /rhino.v1.VMService/GetDomain`
- **Request**:
```json
{
  "id": "ubuntu-dev"
}
```
- **Response**:
```json
{
  "domain": {
    "summary": {
      "uuid": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "ubuntu-dev",
      "state": "DOMAIN_STATE_RUNNING"
    },
    "compute": {
      "vcpus": 4,
      "memoryKib": "8388608",
      "maxMemoryKib": "8388608"
    },
    "disks": [
      {
        "id": "disk-vda",
        "targetDev": "vda",
        "deviceType": "disk",
        "driverFormat": "qcow2",
        "sourceFile": "/var/lib/libvirt/images/ubuntu-dev.qcow2",
        "bus": "virtio"
      }
    ],
    "interfaces": [
      {
        "id": "interface-525400123456",
        "macAddress": "52:54:00:12:34:56",
        "interfaceType": "network",
        "source": "default",
        "model": "virtio"
      }
    ],
    "emulatorPath": "/usr/bin/qemu-system-x86_64",
    "rawXml": "<domain type='kvm'>...</domain>"
  }
}
```

### `StartDomain` / `StopDomain` / `RestartDomain`
Power lifecycle management.

- **Endpoints**:
  - `POST /rhino.v1.VMService/StartDomain`
  - `POST /rhino.v1.VMService/StopDomain` (with `"force": false` for graceful ACPI shutdown, or `true` for immediate `destroy`)
  - `POST /rhino.v1.VMService/RestartDomain`

```bash
# Graceful stop
curl -s -X POST http://localhost:8080/rhino.v1.VMService/StopDomain \
  -H "Content-Type: application/json" \
  -d '{"id": "ubuntu-dev", "force": false}'
```

### `StreamTelemetry` (Server Streaming)
Pushes continuous live metrics (CPU%, RAM, disk throughput, network rates) directly to the client over an HTTP stream.

- **Endpoint**: `POST /rhino.v1.VMService/StreamTelemetry`
- **Request**:
```json
{
  "id": "ubuntu-dev",
  "intervalMs": 1000
}
```
- **Stream Output** (pushed periodically):
```json
{
  "update": {
    "domainId": "ubuntu-dev",
    "timestampEpochMs": "1729171200000",
    "state": "DOMAIN_STATE_RUNNING",
    "cpuPercent": 24.8,
    "memoryUsedBytes": "4529848320",
    "memoryTotalBytes": "8589934592",
    "diskReadBytesSec": "2097152",
    "diskWriteBytesSec": "524288",
    "netRxBytesSec": "262144",
    "netTxBytesSec": "131072"
  }
}
```

### `GetDomainXML` & `UpdateDomainXML`
Raw XML escape hatch with dry-run validation support.

```bash
# Fetch raw XML
curl -s -X POST http://localhost:8080/rhino.v1.VMService/GetDomainXML \
  -H "Content-Type: application/json" \
  -d '{"id": "ubuntu-dev"}'

# Validate dry-run update without committing
curl -s -X POST http://localhost:8080/rhino.v1.VMService/UpdateDomainXML \
  -H "Content-Type: application/json" \
  -d '{"id": "ubuntu-dev", "xml": "<domain>...</domain>", "dryRun": true}'
```

---

## 4. `rhino.v1.HostService`

### `GetHostInfo`
Returns physical CPU count, memory, and hypervisor details.

```bash
curl -s -X POST http://localhost:8080/rhino.v1.HostService/GetHostInfo \
  -H "Content-Type: application/json" -d '{}'
```

### `ListStoragePools`
Returns all storage pools and their nested storage volumes (QCOW2 disk images and bootable ISOs).

### `ListNetworks`
Returns virtual networks (`default` NAT, routed, or isolated) and host bridge interfaces.

### `ListNodeDevices`
Queries host PCI devices (GPUs, audio controllers, NICs). Accepts an optional `"capabilityFilter": "pci"`.

---

## 5. `rhino.v1.HardwareService`

### `AttachDisk`
Attaches a virtual disk or CD-ROM. Evaluates hotpluggability based on target bus (`virtio`/`scsi` support live hotplug, `sata`/`ide` stage to config with `rebootRequired: true`).

- **Endpoint**: `POST /rhino.v1.HardwareService/AttachDisk`
- **Request**:
```json
{
  "domainId": "ubuntu-dev",
  "live": true,
  "disk": {
    "targetDev": "vdb",
    "deviceType": "disk",
    "driverFormat": "qcow2",
    "sourceFile": "/var/lib/libvirt/images/data.qcow2",
    "bus": "virtio"
  }
}
```
- **Response**:
```json
{
  "disk": { ... },
  "rebootRequired": false
}
```

### `AttachNetworkInterface`
Attaches a virtual network interface card (vNIC) connected to a virtual network or host bridge.

### `AttachPCIDevice`
Passes through a host PCI device (e.g. dedicated GPU) by host address:

```json
{
  "domainId": "win11-gaming",
  "pciDevice": {
    "domain": "0x0000",
    "bus": "0x01",
    "slot": "0x00",
    "function": "0x0"
  }
}
```
