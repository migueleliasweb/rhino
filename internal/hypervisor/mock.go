package hypervisor

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
)

type mockDomainRecord struct {
	Summary DomainSummary
	XML     string
}

// MockClient implements HypervisorClient entirely in memory for development and testing.
type MockClient struct {
	mu           sync.RWMutex
	domains      map[string]*mockDomainRecord
	storagePools []StoragePoolSummary
	networks     []NetworkSummary
	nodeDevices  []NodeDeviceSummary
	hostInfo     HostInfo
	tickCount    int64
}

// NewMockClient creates an in-memory client populated with realistic sample data.
func NewMockClient() *MockClient {
	c := &MockClient{
		domains: make(map[string]*mockDomainRecord),
		hostInfo: HostInfo{
			Model:          "x86_64",
			MemoryKiB:      67108864, // 64 GiB
			CPUs:           16,
			MHz:            3800,
			Nodes:          1,
			Sockets:        1,
			Cores:          8,
			Threads:        2,
			Hypervisor:     "QEMU/KVM (Simulated)",
			LibvirtVersion: "10.0.0",
		},
		storagePools: []StoragePoolSummary{
			{
				Name:            "default",
				UUID:            "11111111-2222-3333-4444-555555555555",
				State:           "running",
				CapacityBytes:   1073741824000, // 1 TB
				AllocationBytes: 214748364800,  // 200 GB
				AvailableBytes:  858993459200,  // 800 GB
				TargetPath:      "/var/lib/libvirt/images",
				Volumes: []StorageVolumeSummary{
					{
						Name:            "ubuntu-dev.qcow2",
						Key:             "/var/lib/libvirt/images/ubuntu-dev.qcow2",
						Path:            "/var/lib/libvirt/images/ubuntu-dev.qcow2",
						CapacityBytes:   42949672960, // 40 GB
						AllocationBytes: 12884901888, // 12 GB
						Format:          "qcow2",
						PoolName:        "default",
					},
					{
						Name:            "win11-gaming.qcow2",
						Key:             "/var/lib/libvirt/images/win11-gaming.qcow2",
						Path:            "/var/lib/libvirt/images/win11-gaming.qcow2",
						CapacityBytes:   137438953472, // 128 GB
						AllocationBytes: 53687091200,  // 50 GB
						Format:          "qcow2",
						PoolName:        "default",
					},
				},
			},
			{
				Name:            "boot-isos",
				UUID:            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
				State:           "running",
				CapacityBytes:   536870912000,
				AllocationBytes: 10737418240,
				AvailableBytes:  526133493760,
				TargetPath:      "/var/lib/libvirt/boot-iso",
				Volumes: []StorageVolumeSummary{
					{
						Name:            "ubuntu-24.04-live-server-amd64.iso",
						Key:             "/var/lib/libvirt/boot-iso/ubuntu-24.04-live-server-amd64.iso",
						Path:            "/var/lib/libvirt/boot-iso/ubuntu-24.04-live-server-amd64.iso",
						CapacityBytes:   2684354560, // 2.5 GB
						AllocationBytes: 2684354560,
						Format:          "iso",
						PoolName:        "boot-isos",
					},
					{
						Name:            "Win11_23H2_English_x64v2.iso",
						Key:             "/var/lib/libvirt/boot-iso/Win11_23H2_English_x64v2.iso",
						Path:            "/var/lib/libvirt/boot-iso/Win11_23H2_English_x64v2.iso",
						CapacityBytes:   6442450944, // 6 GB
						AllocationBytes: 6442450944,
						Format:          "iso",
						PoolName:        "boot-isos",
					},
				},
			},
		},
		networks: []NetworkSummary{
			{
				Name:        "default",
				UUID:        "99999999-8888-7777-6666-555555555555",
				BridgeName:  "virbr0",
				ForwardMode: "nat",
				Active:      true,
				Autostart:   true,
				IPAddress:   "192.168.122.1",
				IPNetmask:   "255.255.255.0",
			},
			{
				Name:        "isolated-lab",
				UUID:        "88888888-7777-6666-5555-444444444444",
				BridgeName:  "virbr1",
				ForwardMode: "isolated",
				Active:      true,
				Autostart:   false,
				IPAddress:   "10.0.10.1",
				IPNetmask:   "255.255.255.0",
			},
		},
		nodeDevices: []NodeDeviceSummary{
			{
				Name:        "pci_0000_01_00_0",
				Parent:      "pci_0000_00_01_0",
				Capability:  "pci",
				Domain:      "0x0000",
				Bus:         "0x01",
				Slot:        "0x00",
				Function:    "0x0",
				VendorID:    "0x10de",
				ProductID:   "0x2782",
				VendorName:  "NVIDIA Corporation",
				ProductName: "AD104 [GeForce RTX 4070]",
				IOMMUGroup:  16,
			},
			{
				Name:        "pci_0000_01_00_1",
				Parent:      "pci_0000_00_01_0",
				Capability:  "pci",
				Domain:      "0x0000",
				Bus:         "0x01",
				Slot:        "0x00",
				Function:    "0x1",
				VendorID:    "0x10de",
				ProductID:   "0x22bc",
				VendorName:  "NVIDIA Corporation",
				ProductName: "AD104 High Definition Audio Controller",
				IOMMUGroup:  16,
			},
			{
				Name:        "pci_0000_02_00_0",
				Parent:      "pci_0000_00_1c_0",
				Capability:  "pci",
				Domain:      "0x0000",
				Bus:         "0x02",
				Slot:        "0x00",
				Function:    "0x0",
				VendorID:    "0x8086",
				ProductID:   "0x2723",
				VendorName:  "Intel Corporation",
				ProductName: "Wi-Fi 6 AX200",
				IOMMUGroup:  17,
			},
		},
	}

	// Add sample domains
	c.seedSampleDomains()
	return c
}

func (c *MockClient) seedSampleDomains() {
	c.domains["ubuntu-dev"] = &mockDomainRecord{
		Summary: DomainSummary{
			UUID:         "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
			Name:         "ubuntu-dev",
			ID:           1,
			State:        StateRunning,
			VCPUs:        4,
			MemoryKiB:    8388608,  // 8 GB
			MaxMemoryKiB: 16777216, // 16 GB
			Autostart:    true,
			OSType:       "hvm",
			Arch:         "x86_64",
		},
		XML: `<domain type='kvm'>
  <name>ubuntu-dev</name>
  <uuid>a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d</uuid>
  <memory unit='KiB'>8388608</memory>
  <currentMemory unit='KiB'>8388608</currentMemory>
  <vcpu placement='static'>4</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
  </os>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='/var/lib/libvirt/images/ubuntu-dev.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='/var/lib/libvirt/boot-iso/ubuntu-24.04-live-server-amd64.iso'/>
      <target dev='sda' bus='sata'/>
      <readonly/>
    </disk>
    <interface type='network'>
      <mac address='52:54:00:12:34:56'/>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'/>
  </devices>
</domain>`,
	}

	c.domains["win11-gaming"] = &mockDomainRecord{
		Summary: DomainSummary{
			UUID:         "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
			Name:         "win11-gaming",
			ID:           2,
			State:        StateRunning,
			VCPUs:        8,
			MemoryKiB:    16777216, // 16 GB
			MaxMemoryKiB: 33554432, // 32 GB
			Autostart:    false,
			OSType:       "hvm",
			Arch:         "x86_64",
		},
		XML: `<domain type='kvm'>
  <name>win11-gaming</name>
  <uuid>b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e</uuid>
  <memory unit='KiB'>16777216</memory>
  <currentMemory unit='KiB'>16777216</currentMemory>
  <vcpu placement='static'>8</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
  </os>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='/var/lib/libvirt/images/win11-gaming.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <mac address='52:54:00:aa:bb:cc'/>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
      </source>
    </hostdev>
  </devices>
</domain>`,
	}

	c.domains["alpine-router"] = &mockDomainRecord{
		Summary: DomainSummary{
			UUID:         "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
			Name:         "alpine-router",
			ID:           -1,
			State:        StateShutoff,
			VCPUs:        1,
			MemoryKiB:    524288, // 512 MB
			MaxMemoryKiB: 524288,
			Autostart:    true,
			OSType:       "hvm",
			Arch:         "x86_64",
		},
		XML: `<domain type='kvm'>
  <name>alpine-router</name>
  <uuid>c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f</uuid>
  <memory unit='KiB'>524288</memory>
  <currentMemory unit='KiB'>524288</currentMemory>
  <vcpu placement='static'>1</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
  </os>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='/var/lib/libvirt/images/alpine-router.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <mac address='52:54:00:11:22:33'/>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
  </devices>
</domain>`,
	}
}

func (c *MockClient) findRecord(id string) (*mockDomainRecord, bool) {
	if rec, ok := c.domains[id]; ok {
		return rec, true
	}
	for _, rec := range c.domains {
		if rec.Summary.UUID == id {
			return rec, true
		}
	}
	return nil, false
}

func (c *MockClient) ListDomains(_ context.Context) ([]DomainSummary, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	res := make([]DomainSummary, 0, len(c.domains))
	for _, rec := range c.domains {
		res = append(res, rec.Summary)
	}
	return res, nil
}

func (c *MockClient) GetDomainXML(_ context.Context, id string) (string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	rec, ok := c.findRecord(id)
	if !ok {
		return "", fmt.Errorf("domain %q not found", id)
	}
	return rec.XML, nil
}

func (c *MockClient) DefineDomainXML(_ context.Context, xmlStr string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// In mock mode, we record it or update existing
	name := fmt.Sprintf("custom-domain-%d", time.Now().Unix())
	uuid := fmt.Sprintf("00000000-0000-0000-0000-%012d", time.Now().UnixNano()%1000000000000)
	c.domains[name] = &mockDomainRecord{
		Summary: DomainSummary{
			UUID:         uuid,
			Name:         name,
			ID:           -1,
			State:        StateShutoff,
			VCPUs:        2,
			MemoryKiB:    2097152,
			MaxMemoryKiB: 4194304,
			Autostart:    false,
			OSType:       "hvm",
			Arch:         "x86_64",
		},
		XML: xmlStr,
	}
	return uuid, nil
}

func (c *MockClient) StartDomain(_ context.Context, id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	rec, ok := c.findRecord(id)
	if !ok {
		return fmt.Errorf("domain %q not found", id)
	}
	rec.Summary.State = StateRunning
	rec.Summary.ID = 100 + rand.Int31n(800)
	return nil
}

func (c *MockClient) StopDomain(_ context.Context, id string, _ bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	rec, ok := c.findRecord(id)
	if !ok {
		return fmt.Errorf("domain %q not found", id)
	}
	rec.Summary.State = StateShutoff
	rec.Summary.ID = -1
	return nil
}

func (c *MockClient) RestartDomain(_ context.Context, id string, _ bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	rec, ok := c.findRecord(id)
	if !ok {
		return fmt.Errorf("domain %q not found", id)
	}
	rec.Summary.State = StateRunning
	return nil
}

func (c *MockClient) DeleteDomain(_ context.Context, id string, _ bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for k, rec := range c.domains {
		if k == id || rec.Summary.UUID == id {
			delete(c.domains, k)
			return nil
		}
	}
	return fmt.Errorf("domain %q not found", id)
}

func (c *MockClient) AttachDevice(_ context.Context, id string, _ string, _, _ bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, ok := c.findRecord(id)
	if !ok {
		return fmt.Errorf("domain %q not found", id)
	}
	return nil
}

func (c *MockClient) DetachDevice(_ context.Context, id string, _ string, _, _ bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	_, ok := c.findRecord(id)
	if !ok {
		return fmt.Errorf("domain %q not found", id)
	}
	return nil
}

func (c *MockClient) GetDomainStats(_ context.Context, id string) (*DomainMetrics, error) {
	c.mu.Lock()
	c.tickCount++
	tick := float64(c.tickCount)
	c.mu.Unlock()

	c.mu.RLock()
	defer c.mu.RUnlock()

	rec, ok := c.findRecord(id)
	if !ok {
		return nil, fmt.Errorf("domain %q not found", id)
	}

	if rec.Summary.State != StateRunning {
		return &DomainMetrics{
			DomainID:  id,
			Timestamp: time.Now(),
			State:     rec.Summary.State,
		}, nil
	}

	// Produce realistic sinusoidal CPU and Memory fluctuations
	baseCPU := 25.0
	cpuOscillation := math.Sin(tick*0.2) * 15.0
	cpuPct := math.Max(1.0, baseCPU+cpuOscillation)

	totalMem := rec.Summary.MemoryKiB * 1024
	usedMem := int64(float64(totalMem) * (0.45 + (math.Cos(tick*0.1) * 0.15)))

	return &DomainMetrics{
		DomainID:          rec.Summary.Name,
		Timestamp:         time.Now(),
		State:             rec.Summary.State,
		CPUPercent:        math.Round(cpuPct*10) / 10,
		MemoryUsedBytes:   usedMem,
		MemoryTotalBytes:  totalMem,
		DiskReadBytesSec:  int64(math.Max(0, 1024*1024*(2.0+math.Sin(tick*0.5)))),
		DiskWriteBytesSec: int64(math.Max(0, 1024*512*(1.5+math.Cos(tick*0.3)))),
		NetRxBytesSec:     int64(math.Max(0, 1024*256*(1.0+math.Sin(tick*0.7)))),
		NetTxBytesSec:     int64(math.Max(0, 1024*128*(1.0+math.Cos(tick*0.4)))),
	}, nil
}

func (c *MockClient) GetHostInfo(_ context.Context) (*HostInfo, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return &c.hostInfo, nil
}

func (c *MockClient) ListStoragePools(_ context.Context) ([]StoragePoolSummary, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.storagePools, nil
}

func (c *MockClient) ListNetworks(_ context.Context) ([]NetworkSummary, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.networks, nil
}

func (c *MockClient) ListNodeDevices(_ context.Context, _ string) ([]NodeDeviceSummary, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.nodeDevices, nil
}

func (c *MockClient) Close() error {
	return nil
}
