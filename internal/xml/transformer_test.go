package xml

import (
	"testing"
)

const sampleDomainXML = `<domain type='kvm'>
  <name>test-vm</name>
  <uuid>12345678-1234-1234-1234-123456789abc</uuid>
  <memory unit='KiB'>4194304</memory>
  <currentMemory unit='KiB'>2097152</currentMemory>
  <vcpu placement='static'>4</vcpu>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='/var/lib/libvirt/images/test.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='/isos/ubuntu.iso'/>
      <target dev='sda' bus='sata'/>
      <readonly/>
    </disk>
    <interface type='network'>
      <mac address='52:54:00:11:22:33'/>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
      </source>
    </hostdev>
  </devices>
</domain>`

func TestParseDomainAndExtract(t *testing.T) {
	parsed, err := ParseDomain(sampleDomainXML)
	if err != nil {
		t.Fatalf("ParseDomain failed: %v", err)
	}

	compute := parsed.ExtractComputeConfig()
	if compute.Vcpus != 4 {
		t.Errorf("expected 4 vcpus, got %d", compute.Vcpus)
	}
	if compute.MemoryKib != 2097152 {
		t.Errorf("expected 2097152 KiB memory, got %d", compute.MemoryKib)
	}
	if compute.MaxMemoryKib != 4194304 {
		t.Errorf("expected 4194304 KiB max memory, got %d", compute.MaxMemoryKib)
	}

	disks := parsed.ExtractDisks()
	if len(disks) != 2 {
		t.Fatalf("expected 2 disks, got %d", len(disks))
	}
	if disks[0].TargetDev != "vda" || disks[0].Bus != "virtio" || disks[0].DriverFormat != "qcow2" {
		t.Errorf("unexpected disk 0: %+v", disks[0])
	}
	if disks[1].DeviceType != "cdrom" || !disks[1].Readonly {
		t.Errorf("unexpected cdrom disk: %+v", disks[1])
	}

	ifaces := parsed.ExtractInterfaces()
	if len(ifaces) != 1 {
		t.Fatalf("expected 1 interface, got %d", len(ifaces))
	}
	if ifaces[0].MacAddress != "52:54:00:11:22:33" || ifaces[0].Source != "default" {
		t.Errorf("unexpected interface: %+v", ifaces[0])
	}

	pciDevs := parsed.ExtractPCIDevices()
	if len(pciDevs) != 1 {
		t.Fatalf("expected 1 PCI device, got %d", len(pciDevs))
	}
	if pciDevs[0].Bus != "0x01" || pciDevs[0].Slot != "0x00" {
		t.Errorf("unexpected PCI device: %+v", pciDevs[0])
	}
}

func TestBuildDiskXML(t *testing.T) {
	parsed, _ := ParseDomain(sampleDomainXML)
	disks := parsed.ExtractDisks()
	xmlStr, err := BuildDiskXML(disks[0])
	if err != nil {
		t.Fatalf("BuildDiskXML failed: %v", err)
	}
	if xmlStr == "" {
		t.Error("expected non-empty XML")
	}
}
