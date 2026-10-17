import React, { useState } from 'react';
import { X, Copy, Check, Code } from 'lucide-react';

interface XmlViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  domainName: string;
  xml: string;
}

export const XmlViewerModal: React.FC<XmlViewerModalProps> = ({
  isOpen,
  onClose,
  domainName,
  xml,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[85vh] bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-neutral-950">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-sm text-white">Libvirt Domain XML</h3>
            <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-white/5">
              {domainName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy XML'}</span>
            </button>
            <button
              id="close-xml-modal-btn"
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-4 bg-[#09090b]">
          <pre className="font-mono text-xs text-neutral-300 leading-relaxed overflow-x-auto select-text whitespace-pre">
            {xml || '<!-- No XML available -->'}
          </pre>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 border-t border-white/5 bg-neutral-950 flex justify-between items-center text-xs text-neutral-500 font-mono">
          <span>Read-Only Inspector (Bidirectional editor planned in Phase 4)</span>
          <span>{xml.length} bytes</span>
        </div>
      </div>
    </div>
  );
};
