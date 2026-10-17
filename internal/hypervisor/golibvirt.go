package hypervisor

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/digitalocean/go-libvirt"
)

// GoLibvirtClient implements HypervisorClient talking to a live libvirt daemon via pure Go RPC.
type GoLibvirtClient struct {
	conn net.Conn
	l    *libvirt.Libvirt
}

// Config specifies connection parameters for the GoLibvirtClient.
type Config struct {
	Network string // "unix" or "tcp"
	Address string // e.g. "/var/run/libvirt/libvirt-sock" or "127.0.0.1:16509"
	Timeout time.Duration
}

// NewGoLibvirtClient connects to a libvirt daemon over Unix socket or TCP.
func NewGoLibvirtClient(cfg Config) (*GoLibvirtClient, error) {
	if cfg.Network == "" {
		cfg.Network = "unix"
	}
	if cfg.Address == "" {
		cfg.Address = "/var/run/libvirt/libvirt-sock"
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 5 * time.Second
	}

	conn, err := net.DialTimeout(cfg.Network, cfg.Address, cfg.Timeout)
	if err != nil {
		return nil, fmt.Errorf("failed to dial libvirt at %s://%s: %w", cfg.Network, cfg.Address, err)
	}

	l := libvirt.New(conn)
	if err := l.Connect(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("failed to connect libvirt RPC: %w", err)
	}

	return &GoLibvirtClient{
		conn: conn,
		l:    l,
	}, nil
}

func (c *GoLibvirtClient) Close() error {
	var err1 error
	if c.l != nil {
		err1 = c.l.Disconnect()
	}
	var err2 error
	if c.conn != nil {
		err2 = c.conn.Close()
	}
	if err1 != nil {
		return err1
	}
	return err2
}

func (c *GoLibvirtClient) lookupDomain(id string) (libvirt.Domain, error) {
	// Try lookup by name first
	dom, err := c.l.DomainLookupByName(id)
	if err == nil {
		return dom, nil
	}

	// Try lookup by UUID
	cleanedUUID := strings.ReplaceAll(id, "-", "")
	var uuidBytes [16]byte
	if len(cleanedUUID) == 32 {
		for i := 0; i < 16; i++ {
			var b byte
			_, _ = fmt.Sscanf(cleanedUUID[i*2:i*2+2], "%02x", &b)
			uuidBytes[i] = b
		}
		domUUID, errUUID := c.l.DomainLookupByUUID(uuidBytes)
		if errUUID == nil {
			return domUUID, nil
		}
	}

	return libvirt.Domain{}, fmt.Errorf("domain %q not found: %w", id, err)
}

func (c *GoLibvirtClient) ListDomains(_ context.Context) ([]DomainSummary, error) {
	// Flags 0 returns all domains (active and inactive)
	flags := libvirt.ConnectListDomainsActive | libvirt.ConnectListDomainsInactive
	domains, _, err := c.l.ConnectListAllDomains(1, flags)
	if err != nil {
		return nil, fmt.Errorf("failed to list domains: %w", err)
	}

	res := make([]DomainSummary, 0, len(domains))
	for _, d := range domains {
		state, _, err := c.l.DomainGetState(d, 0)
		if err != nil {
			state = 0
		}

		domState, maxMem, mem, nrVirtCPU, _, err := c.l.DomainGetInfo(d)
		var vcpus int32
		if err == nil {
			if state == 0 {
				state = int32(domState)
			}
			vcpus = int32(nrVirtCPU)
		}

		autostart, _ := c.l.DomainGetAutostart(d)

		res = append(res, DomainSummary{
			UUID:         fmt.Sprintf("%x", d.UUID),
			Name:         d.Name,
			ID:           d.ID,
			State:        DomainState(state),
			VCPUs:        vcpus,
			MemoryKiB:    int64(mem),
			MaxMemoryKiB: int64(maxMem),
			Autostart:    autostart == 1,
		})
	}
	return res, nil
}

func (c *GoLibvirtClient) GetDomainXML(_ context.Context, id string) (string, error) {
	d, err := c.lookupDomain(id)
	if err != nil {
		return "", err
	}
	flags := libvirt.DomainXMLInactive | libvirt.DomainXMLSecure
	xmlStr, err := c.l.DomainGetXMLDesc(d, flags)
	if err != nil {
		return "", fmt.Errorf("failed to get domain XML: %w", err)
	}
	return xmlStr, nil
}

func (c *GoLibvirtClient) DefineDomainXML(_ context.Context, xmlStr string) (string, error) {
	d, err := c.l.DomainDefineXML(xmlStr)
	if err != nil {
		return "", fmt.Errorf("failed to define domain: %w", err)
	}
	return fmt.Sprintf("%x", d.UUID), nil
}

func (c *GoLibvirtClient) StartDomain(_ context.Context, id string) error {
	d, err := c.lookupDomain(id)
	if err != nil {
		return err
	}
	if err := c.l.DomainCreate(d); err != nil {
		return fmt.Errorf("failed to start domain: %w", err)
	}
	return nil
}

func (c *GoLibvirtClient) StopDomain(_ context.Context, id string, force bool) error {
	d, err := c.lookupDomain(id)
	if err != nil {
		return err
	}
	if force {
		if err := c.l.DomainDestroy(d); err != nil {
			return fmt.Errorf("failed to force-stop domain: %w", err)
		}
		return nil
	}
	if err := c.l.DomainShutdown(d); err != nil {
		return fmt.Errorf("failed to gracefully shutdown domain: %w", err)
	}
	return nil
}

func (c *GoLibvirtClient) RestartDomain(ctx context.Context, id string, force bool) error {
	if err := c.StopDomain(ctx, id, force); err != nil {
		return err
	}
	// Small sleep before start
	time.Sleep(500 * time.Millisecond)
	return c.StartDomain(ctx, id)
}

func (c *GoLibvirtClient) DeleteDomain(_ context.Context, id string, _ bool) error {
	d, err := c.lookupDomain(id)
	if err != nil {
		return err
	}
	if err := c.l.DomainUndefine(d); err != nil {
		return fmt.Errorf("failed to undefine domain: %w", err)
	}
	return nil
}

func (c *GoLibvirtClient) AttachDevice(_ context.Context, id string, deviceXML string, live, config bool) error {
	d, err := c.lookupDomain(id)
	if err != nil {
		return err
	}
	var flags libvirt.DomainDeviceModifyFlags
	if live {
		flags |= libvirt.DomainDeviceModifyLive
	}
	if config {
		flags |= libvirt.DomainDeviceModifyConfig
	}
	if flags == 0 {
		flags = libvirt.DomainDeviceModifyConfig
	}
	if err := c.l.DomainAttachDeviceFlags(d, deviceXML, uint32(flags)); err != nil {
		return fmt.Errorf("failed to attach device: %w", err)
	}
	return nil
}

func (c *GoLibvirtClient) DetachDevice(_ context.Context, id string, deviceXML string, live, config bool) error {
	d, err := c.lookupDomain(id)
	if err != nil {
		return err
	}
	var flags libvirt.DomainDeviceModifyFlags
	if live {
		flags |= libvirt.DomainDeviceModifyLive
	}
	if config {
		flags |= libvirt.DomainDeviceModifyConfig
	}
	if flags == 0 {
		flags = libvirt.DomainDeviceModifyConfig
	}
	if err := c.l.DomainDetachDeviceFlags(d, deviceXML, uint32(flags)); err != nil {
		return fmt.Errorf("failed to detach device: %w", err)
	}
	return nil
}

func (c *GoLibvirtClient) GetDomainStats(_ context.Context, id string) (*DomainMetrics, error) {
	d, err := c.lookupDomain(id)
	if err != nil {
		return nil, err
	}

	state, _, _ := c.l.DomainGetState(d, 0)
	_, maxMem, mem, _, cpuTime, _ := c.l.DomainGetInfo(d)

	return &DomainMetrics{
		DomainID:         d.Name,
		Timestamp:        time.Now(),
		State:            DomainState(state),
		CPUPercent:       float64(cpuTime) / 1e9,
		MemoryUsedBytes:  int64(mem) * 1024,
		MemoryTotalBytes: int64(maxMem) * 1024,
	}, nil
}

func (c *GoLibvirtClient) GetHostInfo(_ context.Context) (*HostInfo, error) {
	model, memory, cpus, mhz, nodes, sockets, cores, threads, err := c.l.NodeGetInfo()
	if err != nil {
		return nil, fmt.Errorf("failed to get node info: %w", err)
	}

	modelRunes := make([]rune, 0, len(model))
	for _, b := range model {
		if b == 0 {
			break
		}
		modelRunes = append(modelRunes, rune(b))
	}

	return &HostInfo{
		Model:      string(modelRunes),
		MemoryKiB:  int64(memory),
		CPUs:       cpus,
		MHz:        mhz,
		Nodes:      nodes,
		Sockets:    sockets,
		Cores:      cores,
		Threads:    threads,
		Hypervisor: "KVM/QEMU",
	}, nil
}

func (c *GoLibvirtClient) ListStoragePools(_ context.Context) ([]StoragePoolSummary, error) {
	pools, _, err := c.l.ConnectListAllStoragePools(1, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to list storage pools: %w", err)
	}

	res := make([]StoragePoolSummary, 0, len(pools))
	for _, p := range pools {
		_, capBytes, allocBytes, availBytes, err := c.l.StoragePoolGetInfo(p)
		if err != nil {
			capBytes, allocBytes, availBytes = 0, 0, 0
		}

		res = append(res, StoragePoolSummary{
			Name:            p.Name,
			UUID:            fmt.Sprintf("%x", p.UUID),
			CapacityBytes:   int64(capBytes),
			AllocationBytes: int64(allocBytes),
			AvailableBytes:  int64(availBytes),
		})
	}
	return res, nil
}

func (c *GoLibvirtClient) ListNetworks(_ context.Context) ([]NetworkSummary, error) {
	nets, _, err := c.l.ConnectListAllNetworks(1, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to list networks: %w", err)
	}

	res := make([]NetworkSummary, 0, len(nets))
	for _, n := range nets {
		bridge, _ := c.l.NetworkGetBridgeName(n)
		active, _ := c.l.NetworkIsActive(n)
		autostart, _ := c.l.NetworkGetAutostart(n)

		res = append(res, NetworkSummary{
			Name:       n.Name,
			UUID:       fmt.Sprintf("%x", n.UUID),
			BridgeName: bridge,
			Active:     active == 1,
			Autostart:  autostart == 1,
		})
	}
	return res, nil
}

func (c *GoLibvirtClient) ListNodeDevices(_ context.Context, capType string) ([]NodeDeviceSummary, error) {
	devs, _, err := c.l.ConnectListAllNodeDevices(1, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to list node devices: %w", err)
	}

	res := make([]NodeDeviceSummary, 0, len(devs))
	for _, d := range devs {
		res = append(res, NodeDeviceSummary{
			Name:       d.Name,
			Capability: capType,
		})
	}
	return res, nil
}
