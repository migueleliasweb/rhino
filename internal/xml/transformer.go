package xml

import (
	"fmt"
	"strings"

	"libvirt.org/go/libvirtxml"

	rhinov1 "github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1"
)

// ParsedDomain wraps a libvirtxml.Domain with convenient typed accessor methods.
type ParsedDomain struct {
	RawXML string
	Domain *libvirtxml.Domain
}

// ParseDomain parses a raw libvirt XML string into a strongly-typed libvirtxml.Domain AST.
func ParseDomain(xmlStr string) (*ParsedDomain, error) {
	dom := &libvirtxml.Domain{}
	if err := dom.Unmarshal(xmlStr); err != nil {
		return nil, fmt.Errorf("failed to unmarshal domain XML: %w", err)
	}
	return &ParsedDomain{
		RawXML: xmlStr,
		Domain: dom,
	}, nil
}

// ExtractComputeConfig extracts vCPU and RAM allocations.
func (p *ParsedDomain) ExtractComputeConfig() *rhinov1.ComputeConfig {
	cfg := &rhinov1.ComputeConfig{}
	if p.Domain.VCPU != nil {
		cfg.Vcpus = int32(p.Domain.VCPU.Value)
	}
	if p.Domain.Memory != nil {
		cfg.MaxMemoryKib = int64(p.Domain.Memory.Value)
	}
	if p.Domain.CurrentMemory != nil {
		cfg.MemoryKib = int64(p.Domain.CurrentMemory.Value)
	} else if p.Domain.Memory != nil {
		cfg.MemoryKib = int64(p.Domain.Memory.Value)
	}

	if p.Domain.CPU != nil && p.Domain.CPU.Topology != nil {
		cfg.Sockets = int32(p.Domain.CPU.Topology.Sockets)
		cfg.Cores = int32(p.Domain.CPU.Topology.Cores)
		cfg.Threads = int32(p.Domain.CPU.Topology.Threads)
	}
	return cfg
}

// ExtractDisks extracts virtual disks and CD-ROMs.
func (p *ParsedDomain) ExtractDisks() []*rhinov1.DiskDevice {
	if p.Domain.Devices == nil {
		return nil
	}

	disks := make([]*rhinov1.DiskDevice, 0, len(p.Domain.Devices.Disks))
	for _, d := range p.Domain.Devices.Disks {
		targetDev := ""
		bus := ""
		if d.Target != nil {
			targetDev = d.Target.Dev
			bus = d.Target.Bus
		}

		driverFormat := ""
		if d.Driver != nil {
			driverFormat = d.Driver.Type
		}

		sourceFile := ""
		if d.Source != nil && d.Source.File != nil {
			sourceFile = d.Source.File.File
		}

		id := fmt.Sprintf("disk-%s", targetDev)
		if targetDev == "" {
			id = fmt.Sprintf("disk-%p", &d)
		}

		var bootOrder int32
		if d.Boot != nil {
			bootOrder = int32(d.Boot.Order)
		}

		disks = append(disks, &rhinov1.DiskDevice{
			Id:           id,
			TargetDev:    targetDev,
			DeviceType:   d.Device,
			DriverFormat: driverFormat,
			SourceFile:   sourceFile,
			Bus:          bus,
			Readonly:     d.ReadOnly != nil,
			BootOrder:    bootOrder,
		})
	}
	return disks
}

// ExtractInterfaces extracts virtual network interfaces.
func (p *ParsedDomain) ExtractInterfaces() []*rhinov1.NetworkInterfaceDevice {
	if p.Domain.Devices == nil {
		return nil
	}

	ifaces := make([]*rhinov1.NetworkInterfaceDevice, 0, len(p.Domain.Devices.Interfaces))
	for _, iface := range p.Domain.Devices.Interfaces {
		mac := ""
		if iface.MAC != nil {
			mac = iface.MAC.Address
		}

		ifaceType := "network"
		source := ""
		if iface.Source != nil {
			if iface.Source.Network != nil {
				ifaceType = "network"
				source = iface.Source.Network.Network
			} else if iface.Source.Bridge != nil {
				ifaceType = "bridge"
				source = iface.Source.Bridge.Bridge
			} else if iface.Source.Direct != nil {
				ifaceType = "direct"
				source = iface.Source.Direct.Dev
			}
		}

		model := "virtio"
		if iface.Model != nil {
			model = iface.Model.Type
		}

		id := fmt.Sprintf("interface-%s", strings.ReplaceAll(mac, ":", ""))
		if mac == "" {
			id = fmt.Sprintf("interface-%p", &iface)
		}

		ifaces = append(ifaces, &rhinov1.NetworkInterfaceDevice{
			Id:            id,
			MacAddress:    mac,
			InterfaceType: ifaceType,
			Source:        source,
			Model:         model,
		})
	}
	return ifaces
}

// ExtractPCIDevices extracts passed-through hostdevs.
func (p *ParsedDomain) ExtractPCIDevices() []*rhinov1.PCIDevice {
	if p.Domain.Devices == nil {
		return nil
	}

	pciDevs := make([]*rhinov1.PCIDevice, 0, len(p.Domain.Devices.Hostdevs))
	for _, hd := range p.Domain.Devices.Hostdevs {
		if hd.SubsysPCI != nil && hd.SubsysPCI.Source != nil && hd.SubsysPCI.Source.Address != nil {
			addr := hd.SubsysPCI.Source.Address
			domain := fmt.Sprintf("0x%04x", *addr.Domain)
			bus := fmt.Sprintf("0x%02x", *addr.Bus)
			slot := fmt.Sprintf("0x%02x", *addr.Slot)
			fn := fmt.Sprintf("0x%01x", *addr.Function)

			id := fmt.Sprintf("hostdev-%s_%s_%s_%s", domain, bus, slot, fn)

			pciDevs = append(pciDevs, &rhinov1.PCIDevice{
				Id:       id,
				Domain:   domain,
				Bus:      bus,
				Slot:     slot,
				Function: fn,
			})
		}
	}
	return pciDevs
}

// BuildDiskXML generates valid libvirt XML snippet for attaching a disk.
func BuildDiskXML(disk *rhinov1.DiskDevice) (string, error) {
	d := libvirtxml.DomainDisk{
		Device: disk.DeviceType,
		Target: &libvirtxml.DomainDiskTarget{
			Dev: disk.TargetDev,
			Bus: disk.Bus,
		},
		Driver: &libvirtxml.DomainDiskDriver{
			Name: "qemu",
			Type: disk.DriverFormat,
		},
	}
	if disk.SourceFile != "" {
		d.Source = &libvirtxml.DomainDiskSource{
			File: &libvirtxml.DomainDiskSourceFile{
				File: disk.SourceFile,
			},
		}
	}
	if disk.Readonly {
		d.ReadOnly = &libvirtxml.DomainDiskReadOnly{}
	}

	xmlBytes, err := d.Marshal()
	if err != nil {
		return "", fmt.Errorf("failed to marshal disk XML: %w", err)
	}
	return xmlBytes, nil
}

// BuildInterfaceXML generates valid libvirt XML snippet for attaching an interface.
func BuildInterfaceXML(iface *rhinov1.NetworkInterfaceDevice) (string, error) {
	netIface := libvirtxml.DomainInterface{
		Model: &libvirtxml.DomainInterfaceModel{
			Type: iface.Model,
		},
	}
	if iface.MacAddress != "" {
		netIface.MAC = &libvirtxml.DomainInterfaceMAC{
			Address: iface.MacAddress,
		}
	}

	switch iface.InterfaceType {
	case "bridge":
		netIface.Source = &libvirtxml.DomainInterfaceSource{
			Bridge: &libvirtxml.DomainInterfaceSourceBridge{
				Bridge: iface.Source,
			},
		}
	default: // "network"
		netIface.Source = &libvirtxml.DomainInterfaceSource{
			Network: &libvirtxml.DomainInterfaceSourceNetwork{
				Network: iface.Source,
			},
		}
	}

	xmlBytes, err := netIface.Marshal()
	if err != nil {
		return "", fmt.Errorf("failed to marshal interface XML: %w", err)
	}
	return xmlBytes, nil
}

// IsDeviceHotpluggable evaluates whether the device can safely be attached while the VM is live.
func IsDeviceHotpluggable(devType string, bus string) bool {
	switch devType {
	case "disk":
		// VirtIO and SCSI disks support QEMU live hotplug
		return bus == "virtio" || bus == "scsi"
	case "interface":
		// VirtIO interfaces support live hotplug
		return true
	default:
		return false
	}
}
