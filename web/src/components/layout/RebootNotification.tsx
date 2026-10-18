import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

interface RebootNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  onRestart: () => void;
  vmName: string;
}

export const RebootNotification: React.FC<RebootNotificationProps> = ({
  isOpen,
  onClose,
  onRestart,
  vmName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-20 right-6 z-50 max-w-md w-full p-4 rounded-2xl bg-[#18150a]/95 border border-amber-500/40 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-200">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 text-xs">
          <h3 className="font-semibold text-white text-sm">VM Reboot Required</h3>
          <p className="text-amber-200/90 mt-1 leading-relaxed">
            Hardware configuration for <span className="font-semibold text-white">{vmName}</span> has been staged. A reboot is required for PCI passthrough or non-hotpluggable devices to activate.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                onRestart();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/50 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart VM Now</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-neutral-500 hover:text-white rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
