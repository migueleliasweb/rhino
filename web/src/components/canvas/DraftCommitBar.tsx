import React from 'react';
import { Check, RotateCcw, AlertTriangle, Loader2, Sparkles, Layers } from 'lucide-react';
import type { StagedAddition } from '@/hooks/useDraftChanges';

interface DraftCommitBarProps {
  hasChanges: boolean;
  stagedAdditions: StagedAddition[];
  stagedDeletions: Set<string>;
  requiresReboot: boolean;
  isApplying: boolean;
  onDiscard: () => void;
  onApply: () => void;
}

export const DraftCommitBar: React.FC<DraftCommitBarProps> = ({
  hasChanges,
  stagedAdditions,
  stagedDeletions,
  requiresReboot,
  isApplying,
  onDiscard,
  onApply,
}) => {
  if (!hasChanges) return null;

  const addCount = stagedAdditions.length;
  const delCount = stagedDeletions.size;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#12131c]/95 border border-white/15 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-200">
      {/* Draft Status Badge */}
      <div className="flex items-center gap-2.5 pr-2 border-r border-white/10">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
          <Layers className="w-4 h-4" />
        </div>
        <div className="text-xs">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <span>Staged Blueprint</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-2">
            {addCount > 0 && (
              <span className="text-emerald-400 font-medium">+{addCount} to add</span>
            )}
            {addCount > 0 && delCount > 0 && <span>•</span>}
            {delCount > 0 && (
              <span className="text-rose-400 font-medium">-{delCount} to detach</span>
            )}
          </div>
        </div>
      </div>

      {/* Reboot Required Indicator */}
      {requiresReboot && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[11px] font-mono">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Reboot Required</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onDiscard}
          disabled={isApplying}
          title="Discard all staged additions and deletions"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Discard</span>
        </button>

        <button
          id="apply-changes-btn"
          onClick={onApply}
          disabled={isApplying}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-950/60 transition-all cursor-pointer"
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Apply Changes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
