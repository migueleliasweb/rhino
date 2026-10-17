package service

import (
	"context"

	"connectrpc.com/connect"

	rhinov1 "github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1"
	"github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1/rhinov1connect"
	"github.com/migueleliasweb/rhino/internal/hypervisor"
)

// HostServiceHandler implements rhinov1connect.HostServiceHandler.
type HostServiceHandler struct {
	client hypervisor.HypervisorClient
}

// NewHostServiceHandler creates a new HostServiceHandler.
func NewHostServiceHandler(client hypervisor.HypervisorClient) *HostServiceHandler {
	return &HostServiceHandler{client: client}
}

var _ rhinov1connect.HostServiceHandler = (*HostServiceHandler)(nil)

func (s *HostServiceHandler) GetHostInfo(
	ctx context.Context,
	_ *connect.Request[rhinov1.GetHostInfoRequest],
) (*connect.Response[rhinov1.GetHostInfoResponse], error) {
	info, err := s.client.GetHostInfo(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&rhinov1.GetHostInfoResponse{
		HostInfo: &rhinov1.HostInfo{
			Model:          info.Model,
			MemoryKib:      info.MemoryKiB,
			Cpus:           info.CPUs,
			Mhz:            info.MHz,
			Nodes:          info.Nodes,
			Sockets:        info.Sockets,
			Cores:          info.Cores,
			Threads:        info.Threads,
			Hypervisor:     info.Hypervisor,
			LibvirtVersion: info.LibvirtVersion,
		},
	}), nil
}

func (s *HostServiceHandler) ListStoragePools(
	ctx context.Context,
	_ *connect.Request[rhinov1.ListStoragePoolsRequest],
) (*connect.Response[rhinov1.ListStoragePoolsResponse], error) {
	pools, err := s.client.ListStoragePools(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	res := make([]*rhinov1.StoragePool, 0, len(pools))
	for _, p := range pools {
		vols := make([]*rhinov1.StorageVolume, 0, len(p.Volumes))
		for _, v := range p.Volumes {
			vols = append(vols, &rhinov1.StorageVolume{
				Name:            v.Name,
				Key:             v.Key,
				Path:            v.Path,
				CapacityBytes:   v.CapacityBytes,
				AllocationBytes: v.AllocationBytes,
				Format:          v.Format,
				PoolName:        v.PoolName,
			})
		}
		res = append(res, &rhinov1.StoragePool{
			Name:            p.Name,
			Uuid:            p.UUID,
			State:           p.State,
			CapacityBytes:   p.CapacityBytes,
			AllocationBytes: p.AllocationBytes,
			AvailableBytes:  p.AvailableBytes,
			TargetPath:      p.TargetPath,
			Volumes:         vols,
		})
	}

	return connect.NewResponse(&rhinov1.ListStoragePoolsResponse{
		Pools: res,
	}), nil
}

func (s *HostServiceHandler) ListNetworks(
	ctx context.Context,
	_ *connect.Request[rhinov1.ListNetworksRequest],
) (*connect.Response[rhinov1.ListNetworksResponse], error) {
	nets, err := s.client.ListNetworks(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	res := make([]*rhinov1.VirtualNetwork, 0, len(nets))
	for _, n := range nets {
		res = append(res, &rhinov1.VirtualNetwork{
			Name:        n.Name,
			Uuid:        n.UUID,
			BridgeName:  n.BridgeName,
			ForwardMode: n.ForwardMode,
			Active:      n.Active,
			Autostart:   n.Autostart,
			IpAddress:   n.IPAddress,
			IpNetmask:   n.IPNetmask,
		})
	}

	return connect.NewResponse(&rhinov1.ListNetworksResponse{
		Networks: res,
	}), nil
}

func (s *HostServiceHandler) ListNodeDevices(
	ctx context.Context,
	req *connect.Request[rhinov1.ListNodeDevicesRequest],
) (*connect.Response[rhinov1.ListNodeDevicesResponse], error) {
	devs, err := s.client.ListNodeDevices(ctx, req.Msg.CapabilityFilter)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	res := make([]*rhinov1.HostNodeDevice, 0, len(devs))
	for _, d := range devs {
		res = append(res, &rhinov1.HostNodeDevice{
			Name:        d.Name,
			Parent:      d.Parent,
			Capability:  d.Capability,
			Domain:      d.Domain,
			Bus:         d.Bus,
			Slot:        d.Slot,
			Function:    d.Function,
			VendorId:    d.VendorID,
			ProductId:   d.ProductID,
			VendorName:  d.VendorName,
			ProductName: d.ProductName,
			IommuGroup:  d.IOMMUGroup,
		})
	}

	return connect.NewResponse(&rhinov1.ListNodeDevicesResponse{
		Devices: res,
	}), nil
}
