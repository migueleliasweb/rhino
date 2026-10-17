import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { HardDrive, Network, Cpu, Zap, Disc, Server } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { DiskDevice, NetworkInterfaceDevice, PCIDevice, ComputeConfig } from '@/gen/rhino/v1/hardware_pb';

export type CapabilityType = 'storage' | 'network' | 'compute' | 'pci';

export interface CapabilityNodeData {
  type: CapabilityType;
  disk?: DiskDevice;
  network?: NetworkInterfaceDevice;
  pci?: PCIDevice;
  compute?: ComputeConfig;
  status?: 'normal' | 'staged-add' | 'staged-delete';
  positionSide?: 'left' | 'right';
  onDetach?: () => void;
}

export const CapabilityNode = memo(({ data }: NodeProps) => {
  const nodeData = data as unknown as CapabilityNodeData;
  const { type, status = 'normal', positionSide = 'left' } = nodeData;

  const isStagedAdd = status === 'staged-add';
  const isStagedDelete = status === 'staged-delete';

  let config = {
    title: 'Capability',
    badge: 'Hardware',
    badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    borderColor: 'border-zinc-800 hover:border-zinc-700',
    headerBg: 'bg-zinc-900/50',
    icon: Server,
    iconColor: 'text-zinc-400',
  };

  switch (type) {
    case 'storage': {
      const isCdrom = nodeData.disk?.deviceType === 'cdrom';
      config = {
        title: isCdrom ? 'CD-ROM Media' : `Disk (${nodeData.disk?.targetDev || 'vdX'})`,
        badge: isCdrom ? 'ISO' : nodeData.disk?.driverFormat?.toUpperCase() || 'STORAGE',
        badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
        borderColor: 'border-emerald-900/40 hover:border-emerald-600/60',
        headerBg: 'bg-emerald-950/20',
        icon: isCdrom ? Disc : HardDrive,
        iconColor: 'text-emerald-400',
      };
      break;
    }

    case 'network': {
      config = {
        title: `Interface (${nodeData.network?.model || 'virtio'})`,
        badge: nodeData.network?.source?.toUpperCase() || 'NETWORK',
        badgeColor: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
        borderColor: 'border-sky-900/40 hover:border-sky-600/60',
        headerBg: 'bg-sky-950/20',
        icon: Network,
        iconColor: 'text-sky-400',
      };
      break;
    }

    case 'compute': {
      config = {
        title: 'Compute Sizing',
        badge: 'vCPU & RAM',
        badgeColor: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
        borderColor: 'border-purple-900/40 hover:border-purple-600/60',
        headerBg: 'bg-purple-950/20',
        icon: Cpu,
        iconColor: 'text-purple-400',
      };
      break;
    }

    case 'pci': {
      config = {
        title: nodeData.pci?.vendorName || 'PCI Host Device',
        badge: 'PASSTHROUGH',
        badgeColor: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
        borderColor: 'border-amber-900/40 hover:border-amber-600/60',
        headerBg: 'bg-amber-950/20',
        icon: Zap,
        iconColor: 'text-amber-400',
      };
      break;
    }
  }

  const IconComponent = config.icon;

  return (
    <div
      className={`min-w-[260px] max-w-[320px] rounded-xl border backdrop-blur-md shadow-xl transition-all duration-200 select-none ${
        config.borderColor
      } ${
        isStagedAdd
          ? 'ring-2 ring-emerald-500/70 border-emerald-500 shadow-emerald-950/40'
          : isStagedDelete
          ? 'ring-2 ring-rose-500/70 border-rose-500 opacity-60'
          : 'bg-neutral-900/90'
      }`}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={positionSide === 'left' ? Position.Right : Position.Left}
        id="target"
        className="!w-3 !h-3 !bg-neutral-950 !border-2 !border-indigo-400 transition-transform hover:!scale-125"
      />
      <Handle
        type="source"
        position={positionSide === 'left' ? Position.Right : Position.Left}
        id="source"
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-neutral-950 transition-transform hover:!scale-125"
      />

      {/* Header */}
      <div className={`px-3.5 py-2.5 border-b border-white/5 flex items-center justify-between rounded-t-xl ${config.headerBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-neutral-950/60 border border-white/10 shrink-0">
            <IconComponent className={`w-4 h-4 ${config.iconColor}`} />
          </div>
          <span className="font-semibold text-xs tracking-tight text-neutral-100 truncate">
            {config.title}
          </span>
        </div>
        <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border shrink-0 ${config.badgeColor}`}>
          {isStagedAdd ? '+ STAGED' : isStagedDelete ? '- DETACH' : config.badge}
        </span>
      </div>

      {/* Body details */}
      <div className="p-3.5 space-y-2 text-xs">
        {type === 'storage' && nodeData.disk && (
          <>
            <div className="flex justify-between items-center text-neutral-400">
              <span>Bus & Target:</span>
              <span className="font-mono text-neutral-200">{nodeData.disk.bus} ({nodeData.disk.targetDev})</span>
            </div>
            {nodeData.disk.capacityBytes > 0n && (
              <div className="flex justify-between items-center text-neutral-400">
                <span>Capacity:</span>
                <span className="font-mono font-medium text-emerald-400">{formatBytes(nodeData.disk.capacityBytes)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-neutral-400">
              <span>Attributes:</span>
              <span className="font-mono text-neutral-300">
                {nodeData.disk.readonly ? 'Read-Only' : 'Read/Write'}
                {nodeData.disk.bootOrder > 0 ? ` • Boot #${nodeData.disk.bootOrder}` : ''}
              </span>
            </div>
            {nodeData.disk.sourceFile && (
              <div className="pt-1 border-t border-white/5">
                <p className="text-[10px] text-neutral-500 truncate font-mono" title={nodeData.disk.sourceFile}>
                  {nodeData.disk.sourceFile}
                </p>
              </div>
            )}
          </>
        )}

        {type === 'network' && nodeData.network && (
          <>
            <div className="flex justify-between items-center text-neutral-400">
              <span>Source / Net:</span>
              <span className="font-mono text-sky-400 font-medium">{nodeData.network.source}</span>
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>MAC Address:</span>
              <span className="font-mono text-[11px] text-neutral-300">{nodeData.network.macAddress}</span>
            </div>
            {nodeData.network.ipAddresses && nodeData.network.ipAddresses.length > 0 ? (
              <div className="flex justify-between items-center text-neutral-400">
                <span>Discovered IP:</span>
                <span className="font-mono text-emerald-400 font-medium">
                  {nodeData.network.ipAddresses.join(', ')}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-neutral-500 italic">
                <span>Discovered IP:</span>
                <span className="font-mono text-[11px]">Querying agent...</span>
              </div>
            )}
          </>
        )}

        {type === 'compute' && nodeData.compute && (
          <>
            <div className="flex justify-between items-center text-neutral-400">
              <span>vCPUs:</span>
              <span className="font-mono text-purple-400 font-semibold">{nodeData.compute.vcpus} Cores</span>
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>Topology:</span>
              <span className="font-mono text-neutral-300">
                {nodeData.compute.sockets}S • {nodeData.compute.cores}C • {nodeData.compute.threads}T
              </span>
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>RAM Allocation:</span>
              <span className="font-mono text-neutral-200 font-medium">
                {formatBytes(Number(nodeData.compute.memoryKib) * 1024)}
              </span>
            </div>
          </>
        )}

        {type === 'pci' && nodeData.pci && (
          <>
            <div className="text-neutral-200 font-medium truncate" title={nodeData.pci.productName}>
              {nodeData.pci.productName}
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>PCI Address:</span>
              <span className="font-mono text-[11px] text-amber-400">
                {nodeData.pci.domain}:{nodeData.pci.bus}:{nodeData.pci.slot}.{nodeData.pci.function}
              </span>
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>IOMMU Group:</span>
              <span className="font-mono text-neutral-300 font-medium">Group {nodeData.pci.iommuGroup}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

CapabilityNode.displayName = 'CapabilityNode';
