package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	rhinov1 "github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1"
	"github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1/rhinov1connect"
	"github.com/migueleliasweb/rhino/internal/hypervisor"
)

func setupTestServer(t *testing.T) (rhinov1connect.VMServiceClient, rhinov1connect.HostServiceClient, rhinov1connect.HardwareServiceClient, func()) {
	t.Helper()
	mockClient := hypervisor.NewMockClient()

	mux := http.NewServeMux()
	vmHandler := NewVMServiceHandler(mockClient)
	vmPath, vmHttp := rhinov1connect.NewVMServiceHandler(vmHandler)
	mux.Handle(vmPath, vmHttp)

	hostHandler := NewHostServiceHandler(mockClient)
	hostPath, hostHttp := rhinov1connect.NewHostServiceHandler(hostHandler)
	mux.Handle(hostPath, hostHttp)

	hwHandler := NewHardwareServiceHandler(mockClient)
	hwPath, hwHttp := rhinov1connect.NewHardwareServiceHandler(hwHandler)
	mux.Handle(hwPath, hwHttp)

	server := httptest.NewServer(mux)

	vmClient := rhinov1connect.NewVMServiceClient(http.DefaultClient, server.URL)
	hostClient := rhinov1connect.NewHostServiceClient(http.DefaultClient, server.URL)
	hwClient := rhinov1connect.NewHardwareServiceClient(http.DefaultClient, server.URL)

	return vmClient, hostClient, hwClient, server.Close
}

func TestListAndGetDomains(t *testing.T) {
	vmClient, _, _, cleanup := setupTestServer(t)
	defer cleanup()

	ctx := context.Background()

	// 1. List active and inactive domains
	listResp, err := vmClient.ListDomains(ctx, connect.NewRequest(&rhinov1.ListDomainsRequest{
		IncludeInactive: true,
	}))
	if err != nil {
		t.Fatalf("ListDomains failed: %v", err)
	}

	if len(listResp.Msg.Domains) < 3 {
		t.Fatalf("expected at least 3 domains, got %d", len(listResp.Msg.Domains))
	}

	// 2. Get ubuntu-dev
	getResp, err := vmClient.GetDomain(ctx, connect.NewRequest(&rhinov1.GetDomainRequest{
		Id: "ubuntu-dev",
	}))
	if err != nil {
		t.Fatalf("GetDomain failed: %v", err)
	}

	dom := getResp.Msg.Domain
	if dom.Summary.Name != "ubuntu-dev" {
		t.Errorf("expected name ubuntu-dev, got %s", dom.Summary.Name)
	}
	if dom.Compute.Vcpus != 4 {
		t.Errorf("expected 4 vcpus, got %d", dom.Compute.Vcpus)
	}
	if len(dom.Disks) != 2 {
		t.Errorf("expected 2 disks, got %d", len(dom.Disks))
	}
	if len(dom.Interfaces) != 1 {
		t.Errorf("expected 1 interface, got %d", len(dom.Interfaces))
	}

	// 3. Get win11-gaming (with PCI hostdev)
	winResp, err := vmClient.GetDomain(ctx, connect.NewRequest(&rhinov1.GetDomainRequest{
		Id: "win11-gaming",
	}))
	if err != nil {
		t.Fatalf("GetDomain for win11-gaming failed: %v", err)
	}
	if len(winResp.Msg.Domain.PciDevices) != 1 {
		t.Errorf("expected 1 PCI device on win11-gaming, got %d", len(winResp.Msg.Domain.PciDevices))
	}
}

func TestDomainLifecycle(t *testing.T) {
	vmClient, _, _, cleanup := setupTestServer(t)
	defer cleanup()

	ctx := context.Background()

	// 1. Stop ubuntu-dev
	stopResp, err := vmClient.StopDomain(ctx, connect.NewRequest(&rhinov1.StopDomainRequest{
		Id:    "ubuntu-dev",
		Force: false,
	}))
	if err != nil {
		t.Fatalf("StopDomain failed: %v", err)
	}
	if !stopResp.Msg.Success {
		t.Errorf("expected stop success to be true")
	}

	// 2. Start alpine-router
	startResp, err := vmClient.StartDomain(ctx, connect.NewRequest(&rhinov1.StartDomainRequest{
		Id: "alpine-router",
	}))
	if err != nil {
		t.Fatalf("StartDomain failed: %v", err)
	}
	if !startResp.Msg.Success {
		t.Errorf("expected start success to be true")
	}
}

func TestTelemetryStreaming(t *testing.T) {
	vmClient, _, _, cleanup := setupTestServer(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	stream, err := vmClient.StreamTelemetry(ctx, connect.NewRequest(&rhinov1.StreamTelemetryRequest{
		Id:         "ubuntu-dev",
		IntervalMs: 200,
	}))
	if err != nil {
		t.Fatalf("StreamTelemetry failed: %v", err)
	}

	received := 0
	for stream.Receive() {
		msg := stream.Msg()
		if msg.Update == nil {
			t.Fatal("expected non-nil telemetry update")
		}
		if msg.Update.DomainId != "ubuntu-dev" {
			t.Errorf("expected domain ubuntu-dev, got %s", msg.Update.DomainId)
		}
		if msg.Update.CpuPercent <= 0 {
			t.Errorf("expected positive CPU percent, got %f", msg.Update.CpuPercent)
		}
		received++
		if received >= 2 {
			break
		}
	}

	if received < 2 {
		t.Errorf("expected at least 2 telemetry frames, got %d (err: %v)", received, stream.Err())
	}
}

func TestHostService(t *testing.T) {
	_, hostClient, _, cleanup := setupTestServer(t)
	defer cleanup()

	ctx := context.Background()

	// Host Info
	infoResp, err := hostClient.GetHostInfo(ctx, connect.NewRequest(&rhinov1.GetHostInfoRequest{}))
	if err != nil {
		t.Fatalf("GetHostInfo failed: %v", err)
	}
	if infoResp.Msg.HostInfo.Cpus <= 0 {
		t.Errorf("expected positive CPUs, got %d", infoResp.Msg.HostInfo.Cpus)
	}

	// Storage Pools
	poolsResp, err := hostClient.ListStoragePools(ctx, connect.NewRequest(&rhinov1.ListStoragePoolsRequest{}))
	if err != nil {
		t.Fatalf("ListStoragePools failed: %v", err)
	}
	if len(poolsResp.Msg.Pools) < 2 {
		t.Errorf("expected at least 2 pools, got %d", len(poolsResp.Msg.Pools))
	}

	// Networks
	netsResp, err := hostClient.ListNetworks(ctx, connect.NewRequest(&rhinov1.ListNetworksRequest{}))
	if err != nil {
		t.Fatalf("ListNetworks failed: %v", err)
	}
	if len(netsResp.Msg.Networks) < 2 {
		t.Errorf("expected at least 2 networks, got %d", len(netsResp.Msg.Networks))
	}

	// Node Devices
	devsResp, err := hostClient.ListNodeDevices(ctx, connect.NewRequest(&rhinov1.ListNodeDevicesRequest{
		CapabilityFilter: "pci",
	}))
	if err != nil {
		t.Fatalf("ListNodeDevices failed: %v", err)
	}
	if len(devsResp.Msg.Devices) < 2 {
		t.Errorf("expected at least 2 PCI devices, got %d", len(devsResp.Msg.Devices))
	}
}

func TestHardwareService(t *testing.T) {
	_, _, hwClient, cleanup := setupTestServer(t)
	defer cleanup()

	ctx := context.Background()

	// Attach Disk
	attachResp, err := hwClient.AttachDisk(ctx, connect.NewRequest(&rhinov1.AttachDiskRequest{
		DomainId: "ubuntu-dev",
		Live:     true,
		Disk: &rhinov1.DiskDevice{
			TargetDev:    "vdb",
			DeviceType:   "disk",
			DriverFormat: "qcow2",
			SourceFile:   "/var/lib/libvirt/images/data.qcow2",
			Bus:          "virtio",
		},
	}))
	if err != nil {
		t.Fatalf("AttachDisk failed: %v", err)
	}
	if attachResp.Msg.RebootRequired {
		t.Errorf("VirtIO disk should hotplug without requiring reboot")
	}

	// Attach Interface
	ifaceResp, err := hwClient.AttachNetworkInterface(ctx, connect.NewRequest(&rhinov1.AttachNetworkInterfaceRequest{
		DomainId: "ubuntu-dev",
		Live:     true,
		Interface: &rhinov1.NetworkInterfaceDevice{
			MacAddress:    "52:54:00:99:88:77",
			InterfaceType: "network",
			Source:        "default",
			Model:         "virtio",
		},
	}))
	if err != nil {
		t.Fatalf("AttachNetworkInterface failed: %v", err)
	}
	if ifaceResp.Msg.RebootRequired {
		t.Errorf("VirtIO interface should hotplug without requiring reboot")
	}
}
