import React from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Code2,
  Radio,
} from 'lucide-react';

interface CanvasToolbarProps {
  onAddHardware?: () => void;
  onToggleXml?: () => void;
  isXmlOpen?: boolean;
  isStreaming?: boolean;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  onAddHardware,
  onToggleXml,
  isXmlOpen,
  isStreaming = true,
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
      {/* Streaming indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/80 border border-white/10 backdrop-blur-md shadow-lg text-xs font-mono text-neutral-300">
        <Radio className={`w-3.5 h-3.5 ${isStreaming ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'}`} />
        <span>{isStreaming ? '1s Stream' : 'Idle'}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-900/80 border border-white/10 backdrop-blur-md shadow-lg">
        <button
          id="add-hardware-btn"
          onClick={onAddHardware}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Hardware</span>
        </button>

        <button
          id="xml-view-btn"
          onClick={onToggleXml}
          title="Toggle Raw XML Inspection"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            isXmlOpen
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>XML View</span>
        </button>
      </div>

      {/* Canvas View Controls */}
      <div className="flex items-center p-1 rounded-xl bg-neutral-900/80 border border-white/10 backdrop-blur-md shadow-lg">
        <button
          onClick={() => zoomIn()}
          title="Zoom In"
          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => zoomOut()}
          title="Zoom Out"
          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          title="Fit to Screen"
          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
