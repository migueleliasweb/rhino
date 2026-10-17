import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Play,
  Square,
  RotateCw,
  Activity,
  HardDrive,
  Network,
  Cpu,
  Layers,
  Power,
} from 'lucide-react';
import { formatBytes, formatBitrate } from '@/lib/utils';
import { DomainState, type DomainDetail, type TelemetryUpdate } from '@/gen/rhino/v1/vm_pb';

export interface VmCoreNodeData {
  domain: DomainDetail;
  telemetry?: TelemetryUpdate | null;
  onStart?: () => void;
  onStop?: (force?: boolean) => void;
  onRestart?: (force?: boolean) => void;
  isActionLoading?: boolean;
}

export const VmCoreNode = memo(({ data }: NodeProps) => {
  const nodeData = data as unknown as VmCoreNodeData;
  const { domain, telemetry, onStart, onStop, onRestart, isActionLoading } = nodeData;

  const summary = domain.summary;
  const state = telemetry?.state ?? summary?.state ?? DomainState.UNSPECIFIED;

  const isRunning = state === DomainState.RUNNING;
  const isPaused = state === DomainState.PAUSED;
  const isShutoff = state === DomainState.SHUTOFF || state === DomainState.UNSPECIFIED;

  // Telemetry computations
  const cpuPercent = telemetry ? Math.min(100, Math.max(0, telemetry.cpuPercent)) : 0;
  const memUsed = telemetry ? Number(telemetry.memoryUsedBytes) : 0;
  const memTotal = telemetry && Number(telemetry.memoryTotalBytes) > 0
    ? Number(telemetry.memoryTotalBytes)
    : Number(summary?.memoryKib || 0) * 1024;
  const memPercent = memTotal > 0 ? Math.min(100, (memUsed / memTotal) * 100) : 0;

  const diskReadSec = telemetry ? Number(telemetry.diskReadBytesSec) : 0;
  const diskWriteSec = telemetry ? Number(telemetry.diskWriteBytesSec) : 0;
  const netRxSec = telemetry ? Number(telemetry.netRxBytesSec) : 0;
  const netTxSec = telemetry ? Number(telemetry.netTxBytesSec) : 0;

  // Status styling
  let stateLabel = 'UNKNOWN';
  let stateColor = 'bg-neutral-800 text-neutral-300 border-neutral-700';
  let glowBorder = 'border-neutral-800 shadow-xl';

  if (isRunning) {
    stateLabel = 'RUNNING';
    stateColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
    glowBorder = 'border-emerald-500/40 shadow-[0_0_35px_-8px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/20';
  } else if (isPaused) {
    stateLabel = 'PAUSED';
    stateColor = 'bg-amber-950/80 text-amber-300 border-amber-500/50';
    glowBorder = 'border-amber-500/40 shadow-[0_0_30px_-8px_rgba(245,158,11,0.25)]';
  } else if (isShutoff) {
    stateLabel = 'SHUTOFF';
    stateColor = 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50';
    glowBorder = 'border-zinc-800 shadow-2xl';
  }

  return (
    <div className={`w-[400px] rounded-2xl bg-neutral-900/95 border backdrop-blur-xl transition-all duration-300 select-none ${glowBorder}`}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="core-in"
        className="!w-3.5 !h-3.5 !bg-indigo-500 !border-2 !border-neutral-950 transition-transform hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="core-left-out"
        className="!w-3.5 !h-3.5 !bg-neutral-950 !border-2 !border-indigo-400 transition-transform hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="core-right-out"
        className="!w-3.5 !h-3.5 !bg-indigo-500 !border-2 !border-neutral-950 transition-transform hover:!scale-125"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="core-right-in"
        className="!w-3.5 !h-3.5 !bg-neutral-950 !border-2 !border-indigo-400 transition-transform hover:!scale-125"
      />

      {/* Top Header */}
      <div className="p-4 border-b border-white/5 bg-gradient-to-r from-neutral-900 via-neutral-900/80 to-neutral-950 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 via-neutral-900 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center shadow-inner">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
              {isRunning && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                {summary?.name || 'Virtual Machine'}
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                <span>{summary?.osType || 'hvm'}</span>
                <span>•</span>
                <span>{summary?.arch || 'x86_64'}</span>
                {summary?.id !== undefined && summary.id >= 0 && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-400">ID #{summary.id}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${stateColor}`}>
              {stateLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Section */}
      <div className="p-4 space-y-3.5">
        {/* CPU & Memory Bar Gauges */}
        <div className="grid grid-cols-2 gap-3">
          {/* CPU Gauge */}
          <div className="bg-neutral-950/60 p-2.5 rounded-xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" /> CPU
              </span>
              <span className="font-mono font-semibold text-white">
                {isRunning ? `${cpuPercent.toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cpuPercent > 80
                    ? 'bg-rose-500'
                    : cpuPercent > 50
                    ? 'bg-amber-400'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${isRunning ? cpuPercent : 0}%` }}
              />
            </div>
            <div className="text-[10px] text-neutral-500 flex justify-between font-mono">
              <span>{summary?.vcpus || 1} vCPU</span>
              <span>Load: {isRunning ? (cpuPercent > 1 ? 'Active' : 'Idle') : 'Offline'}</span>
            </div>
          </div>

          {/* Memory Gauge */}
          <div className="bg-neutral-950/60 p-2.5 rounded-xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-purple-400" /> RAM
              </span>
              <span className="font-mono font-semibold text-white">
                {isRunning ? `${memPercent.toFixed(0)}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  memPercent > 85 ? 'bg-rose-500' : 'bg-purple-500'
                }`}
                style={{ width: `${isRunning ? memPercent : 0}%` }}
              />
            </div>
            <div className="text-[10px] text-neutral-500 flex justify-between font-mono truncate">
              <span>{isRunning ? formatBytes(memUsed) : '0 B'}</span>
              <span>/ {formatBytes(memTotal)}</span>
            </div>
          </div>
        </div>

        {/* Live I/O Metrics (Disk & Network) */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-neutral-950/40 p-2 rounded-lg border border-white/5 space-y-1">
            <div className="text-[10px] text-neutral-400 flex items-center gap-1 font-medium">
              <HardDrive className="w-3 h-3 text-emerald-400" /> Disk I/O Rate
            </div>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-neutral-400">R: <span className="text-neutral-200">{isRunning ? formatBitrate(diskReadSec) : '0 B/s'}</span></span>
              <span className="text-neutral-400">W: <span className="text-neutral-200">{isRunning ? formatBitrate(diskWriteSec) : '0 B/s'}</span></span>
            </div>
          </div>

          <div className="bg-neutral-950/40 p-2 rounded-lg border border-white/5 space-y-1">
            <div className="text-[10px] text-neutral-400 flex items-center gap-1 font-medium">
              <Network className="w-3 h-3 text-sky-400" /> Network Rate
            </div>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-neutral-400">RX: <span className="text-neutral-200">{isRunning ? formatBitrate(netRxSec) : '0 B/s'}</span></span>
              <span className="text-neutral-400">TX: <span className="text-neutral-200">{isRunning ? formatBitrate(netTxSec) : '0 B/s'}</span></span>
            </div>
          </div>
        </div>

        {/* Topology Summary */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-emerald-400" /> {domain.disks.length} Disks
          </span>
          <span className="flex items-center gap-1">
            <Network className="w-3 h-3 text-sky-400" /> {domain.interfaces.length} NICs
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-amber-400" /> {domain.pciDevices.length} PCI
          </span>
        </div>
      </div>

      {/* Bottom Lifecycle Actions Bar */}
      <div className="px-4 py-3 bg-neutral-950/80 border-t border-white/5 rounded-b-2xl flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <>
              <button
                onClick={() => onStop?.(false)}
                disabled={isActionLoading}
                title="Graceful Shutdown"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 transition-colors border border-white/5 disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5 text-amber-400" />
                <span>Shutdown</span>
              </button>
              <button
                onClick={() => onRestart?.(false)}
                disabled={isActionLoading}
                title="Reboot Guest"
                className="p-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-white/5 disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onStop?.(true)}
                disabled={isActionLoading}
                title="Force Power Off (Destroy)"
                className="p-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 transition-colors border border-rose-800/40 disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400" />
              </button>
            </>
          ) : (
            <button
              onClick={onStart}
              disabled={isActionLoading}
              title="Power On VM"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-950/60 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start VM</span>
            </button>
          )}
        </div>

        <div className="text-[10px] text-neutral-500 font-mono">
          {telemetry ? 'Telemetry Live' : 'Polling Ready'}
        </div>
      </div>
    </div>
  );
});

VmCoreNode.displayName = 'VmCoreNode';
