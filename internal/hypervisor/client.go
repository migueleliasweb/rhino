package hypervisor

import (
	"context"
	"sort"
	"strings"
	"time"
)

// DomainState matches standard libvirt domain states.
type DomainState int

const (
	StateNoState DomainState = iota
	StateRunning
	StateBlocked
	StatePaused
	StateShutdown
	StateShutoff
	StateCrashed
	StatePMSuspended
)

func (s DomainState) String() string {
	switch s {
	case StateRunning:
		return "running"
	case StateBlocked:
		return "blocked"
	case StatePaused:
		return "paused"
	case StateShutdown:
		return "shutdown"
	case StateShutoff:
		return "shutoff"
	case StateCrashed:
		return "crashed"
	case StatePMSuspended:
		return "pmsuspended"
	default:
		return "nostate"
	}
}

// StatePriority returns the display priority for domain states:
// Running (0) < Paused (1) < Shutoff/Shutdown (2) < Other (3)
func StatePriority(s DomainState) int {
	switch s {
	case StateRunning:
		return 0
	case StatePaused:
		return 1
	case StateShutoff, StateShutdown, StateNoState:
		return 2
	default:
		return 3
	}
}

// SortDomains sorts a slice of DomainSummary primarily by StatePriority
// and secondarily alphabetically by Name (case-insensitive).
func SortDomains(domains []DomainSummary) {
	sort.Slice(domains, func(i, j int) bool {
		pi := StatePriority(domains[i].State)
		pj := StatePriority(domains[j].State)
		if pi != pj {
			return pi < pj
		}
		return strings.ToLower(domains[i].Name) < strings.ToLower(domains[j].Name)
	})
}

// DomainSummary represents a concise summary of a domain.
type DomainSummary struct {
	UUID         string
	Name         string
	ID           int32
	State        DomainState
	VCPUs        int32
	MemoryKiB    int64
	MaxMemoryKiB int64
	Autostart    bool
	OSType       string
	Arch         string
}

// DomainMetrics represents live telemetry collected for a domain.
type DomainMetrics struct {
	DomainID          string
	Timestamp         time.Time
	State             DomainState
	CPUPercent        float64
	MemoryUsedBytes   int64
	MemoryTotalBytes  int64
	DiskReadBytesSec  int64
	DiskWriteBytesSec int64
	NetRxBytesSec     int64
	NetTxBytesSec     int64
}

// StorageVolumeSummary describes a volume inside a storage pool.
type StorageVolumeSummary struct {
	Name            string
	Key             string
	Path            string
	CapacityBytes   int64
	AllocationBytes int64
	Format          string
	PoolName        string
}

// StoragePoolSummary describes a libvirt storage pool.
type StoragePoolSummary struct {
	Name            string
	UUID            string
	State           string
	CapacityBytes   int64
	AllocationBytes int64
	AvailableBytes  int64
	TargetPath      string
	Volumes         []StorageVolumeSummary
}

// NetworkSummary describes a libvirt virtual network or bridge.
type NetworkSummary struct {
	Name        string
	UUID        string
	BridgeName  string
	ForwardMode string
	Active      bool
	Autostart   bool
	IPAddress   string
	IPNetmask   string
}

// NodeDeviceSummary describes a host device (PCI, USB, etc.).
type NodeDeviceSummary struct {
	Name        string
	Parent      string
	Capability  string
	Domain      string
	Bus         string
	Slot        string
	Function    string
	VendorID    string
	ProductID   string
	VendorName  string
	ProductName string
	IOMMUGroup  int32
}

// HostInfo represents physical host hardware and hypervisor details.
type HostInfo struct {
	Model          string
	MemoryKiB      int64
	CPUs           int32
	MHz            int32
	Nodes          int32
	Sockets        int32
	Cores          int32
	Threads        int32
	Hypervisor     string
	LibvirtVersion string
}

// HypervisorClient defines the modular client interface for hypervisor operations.
type HypervisorClient interface {
	// Domain Lifecycle
	ListDomains(ctx context.Context) ([]DomainSummary, error)
	GetDomainXML(ctx context.Context, id string) (string, error)
	DefineDomainXML(ctx context.Context, xmlStr string) (string, error)
	StartDomain(ctx context.Context, id string) error
	StopDomain(ctx context.Context, id string, force bool) error
	RestartDomain(ctx context.Context, id string, force bool) error
	DeleteDomain(ctx context.Context, id string, removeDisks bool) error

	// Device Mutations
	AttachDevice(ctx context.Context, id string, deviceXML string, live, config bool) error
	DetachDevice(ctx context.Context, id string, deviceXML string, live, config bool) error

	// Telemetry & Metrics
	GetDomainStats(ctx context.Context, id string) (*DomainMetrics, error)

	// Host Resources
	GetHostInfo(ctx context.Context) (*HostInfo, error)
	ListStoragePools(ctx context.Context) ([]StoragePoolSummary, error)
	ListNetworks(ctx context.Context) ([]NetworkSummary, error)
	ListNodeDevices(ctx context.Context, capType string) ([]NodeDeviceSummary, error)

	// Teardown
	Close() error
}
