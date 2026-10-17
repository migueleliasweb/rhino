import React from 'react';
import { Server, Activity, Plus } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { HostInfo } from '@/gen/rhino/v1/host_pb';

interface HeaderProps {
  hostInfo: HostInfo | null;
  onNewVm?: () => void;
  activeDomainName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  hostInfo,
  onNewVm,
  activeDomainName,
}) => {
  return (
    <header className="h-14 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Brand & Active Breadcrumb */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-lg shadow-md shadow-indigo-950/60 font-black">
            🦏
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-wider text-white">RHINO</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                HYPERVISOR
              </span>
            </div>
          </div>
        </div>

        {activeDomainName && (
          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-white/10 text-xs">
            <span className="text-neutral-500">Virtual Machine:</span>
            <span className="font-semibold text-neutral-200 bg-neutral-900 px-2 py-0.5 rounded border border-white/5 font-mono">
              {activeDomainName}
            </span>
          </div>
        )}
      </div>

      {/* Host Summary Pills */}
      <div className="hidden lg:flex items-center gap-3">
        {hostInfo ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900/60 border border-white/5 text-xs text-neutral-400">
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-neutral-300 font-medium">{hostInfo.hypervisor || 'KVM'}</span>
            <span className="text-neutral-600">•</span>
            <span>{hostInfo.cpus} vCPUs ({hostInfo.model})</span>
            <span className="text-neutral-600">•</span>
            <span>{formatBytes(Number(hostInfo.memoryKib) * 1024)} Host RAM</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900/60 border border-white/5 text-xs text-neutral-400">
            <Activity className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span>Connecting to Hypervisor...</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] font-mono text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>ONLINE</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onNewVm}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New VM</span>
        </button>
      </div>
    </header>
  );
};
