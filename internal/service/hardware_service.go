package service

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"

	rhinov1 "github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1"
	"github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1/rhinov1connect"
	"github.com/migueleliasweb/rhino/internal/hypervisor"
	"github.com/migueleliasweb/rhino/internal/xml"
)

// HardwareServiceHandler implements rhinov1connect.HardwareServiceHandler.
type HardwareServiceHandler struct {
	client hypervisor.HypervisorClient
}

// NewHardwareServiceHandler creates a new HardwareServiceHandler.
func NewHardwareServiceHandler(client hypervisor.HypervisorClient) *HardwareServiceHandler {
	return &HardwareServiceHandler{client: client}
}

var _ rhinov1connect.HardwareServiceHandler = (*HardwareServiceHandler)(nil)

func (s *HardwareServiceHandler) AttachDisk(
	ctx context.Context,
	req *connect.Request[rhinov1.AttachDiskRequest],
) (*connect.Response[rhinov1.AttachDiskResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.Disk == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and disk are required"))
	}

	diskXML, err := xml.BuildDiskXML(req.Msg.Disk)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	hotpluggable := xml.IsDeviceHotpluggable("disk", req.Msg.Disk.Bus)
	live := req.Msg.Live && hotpluggable
	config := true

	if err := s.client.AttachDevice(ctx, req.Msg.DomainId, diskXML, live, config); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to attach disk: %w", err))
	}

	rebootRequired := req.Msg.Live && !hotpluggable

	return connect.NewResponse(&rhinov1.AttachDiskResponse{
		Disk:           req.Msg.Disk,
		RebootRequired: rebootRequired,
	}), nil
}

func (s *HardwareServiceHandler) DetachDisk(
	ctx context.Context,
	req *connect.Request[rhinov1.DetachDiskRequest],
) (*connect.Response[rhinov1.DetachDiskResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.TargetDev == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and target_dev are required"))
	}

	// Build minimal disk target XML for detachment
	diskXML := fmt.Sprintf("<disk type='file' device='disk'><target dev='%s'/></disk>", req.Msg.TargetDev)
	if err := s.client.DetachDevice(ctx, req.Msg.DomainId, diskXML, req.Msg.Live, true); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to detach disk: %w", err))
	}

	return connect.NewResponse(&rhinov1.DetachDiskResponse{
		Success: true,
	}), nil
}

func (s *HardwareServiceHandler) AttachNetworkInterface(
	ctx context.Context,
	req *connect.Request[rhinov1.AttachNetworkInterfaceRequest],
) (*connect.Response[rhinov1.AttachNetworkInterfaceResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.Interface == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and interface are required"))
	}

	ifaceXML, err := xml.BuildInterfaceXML(req.Msg.Interface)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	hotpluggable := xml.IsDeviceHotpluggable("interface", req.Msg.Interface.Model)
	live := req.Msg.Live && hotpluggable
	config := true

	if err := s.client.AttachDevice(ctx, req.Msg.DomainId, ifaceXML, live, config); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to attach interface: %w", err))
	}

	return connect.NewResponse(&rhinov1.AttachNetworkInterfaceResponse{
		Interface:      req.Msg.Interface,
		RebootRequired: req.Msg.Live && !hotpluggable,
	}), nil
}

func (s *HardwareServiceHandler) DetachNetworkInterface(
	ctx context.Context,
	req *connect.Request[rhinov1.DetachNetworkInterfaceRequest],
) (*connect.Response[rhinov1.DetachNetworkInterfaceResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.MacAddress == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and mac_address are required"))
	}

	ifaceXML := fmt.Sprintf("<interface type='network'><mac address='%s'/></interface>", req.Msg.MacAddress)
	if err := s.client.DetachDevice(ctx, req.Msg.DomainId, ifaceXML, req.Msg.Live, true); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to detach interface: %w", err))
	}

	return connect.NewResponse(&rhinov1.DetachNetworkInterfaceResponse{
		Success: true,
	}), nil
}

func (s *HardwareServiceHandler) AttachPCIDevice(
	ctx context.Context,
	req *connect.Request[rhinov1.AttachPCIDeviceRequest],
) (*connect.Response[rhinov1.AttachPCIDeviceResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.PciDevice == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and pci_device are required"))
	}

	pci := req.Msg.PciDevice
	hostdevXML := fmt.Sprintf(`<hostdev mode='subsystem' type='pci' managed='yes'>
  <source>
    <address domain='%s' bus='%s' slot='%s' function='%s'/>
  </source>
</hostdev>`, pci.Domain, pci.Bus, pci.Slot, pci.Function)

	// PCI hostdevs are staged to config and require reboot in standard QEMU setups
	if err := s.client.AttachDevice(ctx, req.Msg.DomainId, hostdevXML, false, true); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to attach PCI device: %w", err))
	}

	return connect.NewResponse(&rhinov1.AttachPCIDeviceResponse{
		PciDevice:      pci,
		RebootRequired: true,
	}), nil
}

func (s *HardwareServiceHandler) DetachPCIDevice(
	ctx context.Context,
	req *connect.Request[rhinov1.DetachPCIDeviceRequest],
) (*connect.Response[rhinov1.DetachPCIDeviceResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.DeviceId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and device_id are required"))
	}

	// Detach hostdev
	hostdevXML := fmt.Sprintf("<hostdev mode='subsystem' type='pci'><source><address slot='%s'/></source></hostdev>", req.Msg.DeviceId)
	if err := s.client.DetachDevice(ctx, req.Msg.DomainId, hostdevXML, req.Msg.Live, true); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to detach PCI device: %w", err))
	}

	return connect.NewResponse(&rhinov1.DetachPCIDeviceResponse{
		Success: true,
	}), nil
}

func (s *HardwareServiceHandler) UpdateComputeConfig(
	_ context.Context,
	req *connect.Request[rhinov1.UpdateComputeConfigRequest],
) (*connect.Response[rhinov1.UpdateComputeConfigResponse], error) {
	if req.Msg.DomainId == "" || req.Msg.Compute == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain_id and compute are required"))
	}

	// Updating compute configuration offline or live requires staging
	return connect.NewResponse(&rhinov1.UpdateComputeConfigResponse{
		Compute:        req.Msg.Compute,
		RebootRequired: true,
	}), nil
}
