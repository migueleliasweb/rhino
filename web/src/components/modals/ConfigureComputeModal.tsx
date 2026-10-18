import React, { useState } from 'react';
import { create } from '@bufbuild/protobuf';
import { X, Cpu, Check, AlertCircle } from 'lucide-react';
import { ComputeConfigSchema, type ComputeConfig } from '@/gen/rhino/v1/hardware_pb';
import type { DomainDetail } from '@/gen/rhino/v1/vm_pb';
import { formatBytes } from '@/lib/utils';

interface ConfigureComputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: DomainDetail;
  initialCompute?: ComputeConfig;
  onStageCompute: (compute: ComputeConfig, rebootRequired: boolean) => void;
}

export const ConfigureComputeModal: React.FC<ConfigureComputeModalProps> = ({
  isOpen,
  onClose,
  domain,
  initialCompute,
  onStageCompute,
}) => {
  const currentCompute = initialCompute || domain.compute;

  const [vcpus, setVcpus] = useState<number>(currentCompute?.vcpus || 4);
  const [sockets, setSockets] = useState<number>(currentCompute?.sockets || 1);
  const [cores, setCores] = useState<number>(currentCompute?.cores || 4);
  const [threads, setThreads] = useState<number>(currentCompute?.threads || 1);
  const [memoryGib, setMemoryGib] = useState<number>(
    Math.round((Number(currentCompute?.memoryKib || 8388608) / (1024 * 1024)) * 10) / 10
  );

  React.useEffect(() => {
    if (isOpen) {
      const activeCompute = initialCompute || domain.compute;
      setVcpus(activeCompute?.vcpus || 4);
      setSockets(activeCompute?.sockets || 1);
      setCores(activeCompute?.cores || 4);
      setThreads(activeCompute?.threads || 1);
      setMemoryGib(
        Math.round((Number(activeCompute?.memoryKib || 8388608) / (1024 * 1024)) * 10) / 10
      );
    }
  }, [isOpen, initialCompute, domain.compute]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const memKib = BigInt(Math.round(memoryGib * 1024 * 1024));

    const compute = create(ComputeConfigSchema, {
      vcpus,
      sockets,
      cores,
      threads,
      memoryKib: memKib,
      maxMemoryKib: memKib * 2n,
    });

    onStageCompute(compute, true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Configure Compute Sizing (vCPU & RAM)</h2>
              <p className="text-xs text-neutral-400">Target VM: <span className="text-neutral-200 font-medium">{domain.summary?.name}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* vCPUs and Memory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Virtual CPUs (vCPUs)</label>
              <input
                type="number"
                min="1"
                max="128"
                value={vcpus}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setVcpus(val);
                  setCores(val);
                }}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">RAM Allocation (GiB)</label>
              <input
                type="number"
                min="0.5"
                max="512"
                step="0.5"
                value={memoryGib}
                onChange={(e) => setMemoryGib(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              />
            </div>
          </div>

          {/* CPU Topology Breakdown */}
          <div>
            <label className="block text-neutral-400 mb-1.5 font-medium">CPU Topology Structure</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-neutral-500">Sockets</span>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={sockets}
                  onChange={(e) => setSockets(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/10 text-white font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500">Cores</span>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={cores}
                  onChange={(e) => setCores(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/10 text-white font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-500">Threads</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={threads}
                  onChange={(e) => setThreads(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/10 text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Current vs Proposed Comparison */}
          <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-white/10 flex items-center justify-between font-mono text-[11px]">
            <div>
              <span className="text-neutral-500 block">Current Sizing</span>
              <span className="text-neutral-300 font-medium">
                {currentCompute?.vcpus || 4} vCPUs • {formatBytes(Number(currentCompute?.memoryKib || 8388608) * 1024)}
              </span>
            </div>
            <span className="text-neutral-600 font-bold">→</span>
            <div className="text-right">
              <span className="text-purple-400 block font-semibold">Staged Sizing</span>
              <span className="text-white font-medium">
                {vcpus} vCPUs • {memoryGib} GiB
              </span>
            </div>
          </div>

          {/* Reboot notice */}
          <div className="p-3 rounded-xl border bg-purple-950/30 border-purple-500/30 text-purple-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
            <div>
              <p className="font-semibold text-[11px]">Staged to Configuration</p>
              <p className="text-[10px] opacity-80 mt-0.5">
                CPU and RAM topology restructuring is safely staged to domain XML and takes effect on subsequent VM start or reboot.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-950/50 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Stage to Canvas</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
