import React, { useState } from 'react';
import {
  Search,
  HardDrive,
  Network,
  Zap,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { DomainState, type DomainSummary } from '@/gen/rhino/v1/vm_pb';

interface SidebarProps {
  domains: DomainSummary[];
  selectedDomainId: string | null;
  onSelectDomain: (id: string) => void;
  storagePoolsCount: number;
  networksCount: number;
  pciDevicesCount: number;
  loading?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  domains,
  selectedDomainId,
  onSelectDomain,
  storagePoolsCount,
  networksCount,
  pciDevicesCount,
  loading,
}) => {
  const [search, setSearch] = useState('');

  const filteredDomains = domains.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.uuid.toLowerCase().includes(search.toLowerCase())
  );

  const runningCount = domains.filter((d) => d.state === DomainState.RUNNING).length;

  return (
    <aside className="w-72 border-r border-white/5 bg-neutral-950/90 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Search Input */}
      <div className="p-3 border-b border-white/5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900/80 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Domain List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase flex justify-between items-center">
          <span>Virtual Machines</span>
          <span className="font-mono text-neutral-400">
            {runningCount}/{domains.length} Active
          </span>
        </div>

        {loading && domains.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-500">Loading domains...</div>
        ) : filteredDomains.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-500">No domains found</div>
        ) : (
          filteredDomains.map((domain) => {
            const isSelected = selectedDomainId === domain.uuid || selectedDomainId === domain.name;
            const isRunning = domain.state === DomainState.RUNNING;

            let statusDot = 'bg-neutral-600';
            if (isRunning) statusDot = 'bg-emerald-400 ring-2 ring-emerald-500/20';
            else if (domain.state === DomainState.PAUSED) statusDot = 'bg-amber-400';

            return (
              <button
                key={domain.uuid}
                onClick={() => onSelectDomain(domain.uuid)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/40 shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-neutral-900/60 hover:border-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <span className={`block w-2.5 h-2.5 rounded-full ${statusDot}`} />
                    {isRunning && (
                      <span className="animate-ping absolute -top-0.5 -left-0.5 inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-60"></span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>
                      {domain.name}
                    </p>
                    <p className="text-[10px] text-neutral-500 font-mono truncate">
                      {domain.vcpus} vCPU • {formatBytes(Number(domain.memoryKib) * 1024)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isRunning
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                      : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                  }`}>
                    {isRunning ? 'RUN' : 'OFF'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Host Resource Discovery Counts */}
      <div className="p-3 border-t border-white/5 bg-neutral-950/50 space-y-2">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase block">
          Discovered Capabilities
        </span>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-neutral-900/60 p-1.5 rounded-lg border border-white/5">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
            <div className="text-xs font-mono font-semibold text-neutral-200">{storagePoolsCount}</div>
            <div className="text-[9px] text-neutral-500">Pools</div>
          </div>
          <div className="bg-neutral-900/60 p-1.5 rounded-lg border border-white/5">
            <Network className="w-3.5 h-3.5 text-sky-400 mx-auto mb-1" />
            <div className="text-xs font-mono font-semibold text-neutral-200">{networksCount}</div>
            <div className="text-[9px] text-neutral-500">Nets</div>
          </div>
          <div className="bg-neutral-900/60 p-1.5 rounded-lg border border-white/5">
            <Zap className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
            <div className="text-xs font-mono font-semibold text-neutral-200">{pciDevicesCount}</div>
            <div className="text-[9px] text-neutral-500">PCI Devs</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
