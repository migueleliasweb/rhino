package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"

	rhinov1 "github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1"
	"github.com/migueleliasweb/rhino/server/gen/proto/go/rhino/v1/rhinov1connect"
	"github.com/migueleliasweb/rhino/internal/hypervisor"
	"github.com/migueleliasweb/rhino/internal/xml"
)

// VMServiceHandler implements rhinov1connect.VMServiceHandler.
type VMServiceHandler struct {
	client hypervisor.HypervisorClient
}

func toProtoDomainState(s hypervisor.DomainState) rhinov1.DomainState {
	switch s {
	case hypervisor.StateRunning:
		return rhinov1.DomainState_DOMAIN_STATE_RUNNING
	case hypervisor.StateBlocked:
		return rhinov1.DomainState_DOMAIN_STATE_BLOCKED
	case hypervisor.StatePaused:
		return rhinov1.DomainState_DOMAIN_STATE_PAUSED
	case hypervisor.StateShutdown:
		return rhinov1.DomainState_DOMAIN_STATE_SHUTDOWN
	case hypervisor.StateShutoff:
		return rhinov1.DomainState_DOMAIN_STATE_SHUTOFF
	case hypervisor.StateCrashed:
		return rhinov1.DomainState_DOMAIN_STATE_CRASHED
	case hypervisor.StatePMSuspended:
		return rhinov1.DomainState_DOMAIN_STATE_PMSUSPENDED
	case hypervisor.StateNoState:
		return rhinov1.DomainState_DOMAIN_STATE_NOSTATE
	default:
		return rhinov1.DomainState_DOMAIN_STATE_UNSPECIFIED
	}
}

// NewVMServiceHandler creates a new VMServiceHandler.
func NewVMServiceHandler(client hypervisor.HypervisorClient) *VMServiceHandler {
	return &VMServiceHandler{client: client}
}

var _ rhinov1connect.VMServiceHandler = (*VMServiceHandler)(nil)

func (s *VMServiceHandler) ListDomains(
	ctx context.Context,
	req *connect.Request[rhinov1.ListDomainsRequest],
) (*connect.Response[rhinov1.ListDomainsResponse], error) {
	domains, err := s.client.ListDomains(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	res := make([]*rhinov1.DomainSummary, 0, len(domains))
	for _, d := range domains {
		if !req.Msg.IncludeInactive && d.State == hypervisor.StateShutoff {
			continue
		}
		res = append(res, &rhinov1.DomainSummary{
			Uuid:         d.UUID,
			Name:         d.Name,
			Id:           d.ID,
			State:        toProtoDomainState(d.State),
			Vcpus:        d.VCPUs,
			MemoryKib:    d.MemoryKiB,
			MaxMemoryKib: d.MaxMemoryKiB,
			Autostart:    d.Autostart,
			OsType:       d.OSType,
			Arch:         d.Arch,
		})
	}

	return connect.NewResponse(&rhinov1.ListDomainsResponse{
		Domains: res,
	}), nil
}

func (s *VMServiceHandler) GetDomain(
	ctx context.Context,
	req *connect.Request[rhinov1.GetDomainRequest],
) (*connect.Response[rhinov1.GetDomainResponse], error) {
	if req.Msg.Id == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain id is required"))
	}

	xmlStr, err := s.client.GetDomainXML(ctx, req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	parsed, err := xml.ParseDomain(xmlStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Find summary
	domains, _ := s.client.ListDomains(ctx)
	var summary *rhinov1.DomainSummary
	for _, d := range domains {
		if d.Name == req.Msg.Id || d.UUID == req.Msg.Id {
			summary = &rhinov1.DomainSummary{
				Uuid:         d.UUID,
				Name:         d.Name,
				Id:           d.ID,
				State:        toProtoDomainState(d.State),
				Vcpus:        d.VCPUs,
				MemoryKib:    d.MemoryKiB,
				MaxMemoryKib: d.MaxMemoryKiB,
				Autostart:    d.Autostart,
				OsType:       d.OSType,
				Arch:         d.Arch,
			}
			break
		}
	}
	if summary == nil {
		name := ""
		if parsed.Domain.Name != "" {
			name = parsed.Domain.Name
		}
		uuid := ""
		if parsed.Domain.UUID != "" {
			uuid = parsed.Domain.UUID
		}
		summary = &rhinov1.DomainSummary{
			Name:  name,
			Uuid:  uuid,
			State: rhinov1.DomainState_DOMAIN_STATE_RUNNING,
		}
	}

	detail := &rhinov1.DomainDetail{
		Summary:    summary,
		Compute:    parsed.ExtractComputeConfig(),
		Disks:      parsed.ExtractDisks(),
		Interfaces: parsed.ExtractInterfaces(),
		PciDevices: parsed.ExtractPCIDevices(),
		RawXml:     xmlStr,
	}
	if parsed.Domain.Devices != nil && parsed.Domain.Devices.Emulator != "" {
		detail.EmulatorPath = parsed.Domain.Devices.Emulator
	}

	return connect.NewResponse(&rhinov1.GetDomainResponse{
		Domain: detail,
	}), nil
}

func (s *VMServiceHandler) StartDomain(
	ctx context.Context,
	req *connect.Request[rhinov1.StartDomainRequest],
) (*connect.Response[rhinov1.StartDomainResponse], error) {
	if req.Msg.Id == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain id is required"))
	}

	if err := s.client.StartDomain(ctx, req.Msg.Id); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&rhinov1.StartDomainResponse{
		Success: true,
		State:   rhinov1.DomainState_DOMAIN_STATE_RUNNING,
	}), nil
}

func (s *VMServiceHandler) StopDomain(
	ctx context.Context,
	req *connect.Request[rhinov1.StopDomainRequest],
) (*connect.Response[rhinov1.StopDomainResponse], error) {
	if req.Msg.Id == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain id is required"))
	}

	if err := s.client.StopDomain(ctx, req.Msg.Id, req.Msg.Force); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&rhinov1.StopDomainResponse{
		Success: true,
		State:   rhinov1.DomainState_DOMAIN_STATE_SHUTOFF,
	}), nil
}

func (s *VMServiceHandler) RestartDomain(
	ctx context.Context,
	req *connect.Request[rhinov1.RestartDomainRequest],
) (*connect.Response[rhinov1.RestartDomainResponse], error) {
	if req.Msg.Id == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("domain id is required"))
	}

	if err := s.client.RestartDomain(ctx, req.Msg.Id, req.Msg.Force); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&rhinov1.RestartDomainResponse{
		Success: true,
		State:   rhinov1.DomainState_DOMAIN_STATE_RUNNING,
	}), nil
}

func (s *VMServiceHandler) DeleteDomain(
	ctx context.Context,
	req *connect.Request[rhinov1.DeleteDomainRequest],
) (*connect.Response[rhinov1.DeleteDomainResponse], error) {
	if err := s.client.DeleteDomain(ctx, req.Msg.Id, req.Msg.RemoveDisks); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&rhinov1.DeleteDomainResponse{
		Success: true,
	}), nil
}

func (s *VMServiceHandler) StreamTelemetry(
	ctx context.Context,
	req *connect.Request[rhinov1.StreamTelemetryRequest],
	stream *connect.ServerStream[rhinov1.StreamTelemetryResponse],
) error {
	intervalMs := req.Msg.IntervalMs
	if intervalMs <= 0 {
		intervalMs = 1000
	}
	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	targetID := req.Msg.Id

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// If targetID is empty, push telemetry for first running domain or all
			domainsToPoll := []string{targetID}
			if targetID == "" {
				domains, err := s.client.ListDomains(ctx)
				if err == nil {
					domainsToPoll = nil
					for _, d := range domains {
						if d.State == hypervisor.StateRunning {
							domainsToPoll = append(domainsToPoll, d.Name)
						}
					}
				}
			}

			for _, dName := range domainsToPoll {
				metrics, err := s.client.GetDomainStats(ctx, dName)
				if err != nil {
					continue
				}

				resp := &rhinov1.StreamTelemetryResponse{
					Update: &rhinov1.TelemetryUpdate{
						DomainId:          metrics.DomainID,
						TimestampEpochMs:  metrics.Timestamp.UnixMilli(),
						State:             toProtoDomainState(metrics.State),
						CpuPercent:        metrics.CPUPercent,
						MemoryUsedBytes:   metrics.MemoryUsedBytes,
						MemoryTotalBytes:  metrics.MemoryTotalBytes,
						DiskReadBytesSec:  metrics.DiskReadBytesSec,
						DiskWriteBytesSec: metrics.DiskWriteBytesSec,
						NetRxBytesSec:     metrics.NetRxBytesSec,
						NetTxBytesSec:     metrics.NetTxBytesSec,
					},
				}
				if err := stream.Send(resp); err != nil {
					return err
				}
			}
		}
	}
}

func (s *VMServiceHandler) GetDomainXML(
	ctx context.Context,
	req *connect.Request[rhinov1.GetDomainXMLRequest],
) (*connect.Response[rhinov1.GetDomainXMLResponse], error) {
	xmlStr, err := s.client.GetDomainXML(ctx, req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&rhinov1.GetDomainXMLResponse{
		Xml: xmlStr,
	}), nil
}

func (s *VMServiceHandler) UpdateDomainXML(
	ctx context.Context,
	req *connect.Request[rhinov1.UpdateDomainXMLRequest],
) (*connect.Response[rhinov1.UpdateDomainXMLResponse], error) {
	// Validate unmarshal
	parsed, err := xml.ParseDomain(req.Msg.Xml)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid XML syntax: %w", err))
	}

	if req.Msg.DryRun {
		return connect.NewResponse(&rhinov1.UpdateDomainXMLResponse{
			Success: true,
			Domain: &rhinov1.DomainDetail{
				Compute:    parsed.ExtractComputeConfig(),
				Disks:      parsed.ExtractDisks(),
				Interfaces: parsed.ExtractInterfaces(),
				PciDevices: parsed.ExtractPCIDevices(),
				RawXml:     req.Msg.Xml,
			},
		}), nil
	}

	// Apply definition to hypervisor
	_, err = s.client.DefineDomainXML(ctx, req.Msg.Xml)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to define domain XML: %w", err))
	}

	return connect.NewResponse(&rhinov1.UpdateDomainXMLResponse{
		Success: true,
		Domain: &rhinov1.DomainDetail{
			Compute:    parsed.ExtractComputeConfig(),
			Disks:      parsed.ExtractDisks(),
			Interfaces: parsed.ExtractInterfaces(),
			PciDevices: parsed.ExtractPCIDevices(),
			RawXml:     req.Msg.Xml,
		},
	}), nil
}
