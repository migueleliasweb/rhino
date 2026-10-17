import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface DiffEdgeData {
  status?: 'normal' | 'staged-add' | 'staged-delete';
  label?: string;
}

export const DiffEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const diffData = data as DiffEdgeData | undefined;
  const status = diffData?.status || 'normal';

  let strokeColor = '#6366f1'; // indigo
  let strokeWidth = 2;
  let strokeDasharray = undefined;
  let className = '';

  if (status === 'staged-add') {
    strokeColor = '#10b981'; // emerald
    strokeWidth = 2.5;
    className = 'edge-staged-add';
  } else if (status === 'staged-delete') {
    strokeColor = '#f43f5e'; // rose
    strokeWidth = 2;
    strokeDasharray = '5 5';
    className = 'edge-staged-delete';
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={className}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          filter: status === 'normal' ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.4))' : undefined,
        }}
      />
      {diffData?.label && (
        <foreignObject
          width={90}
          height={24}
          x={labelX - 45}
          y={labelY - 12}
          className="pointer-events-none"
        >
          <div
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full text-center border backdrop-blur-md shadow-md ${
              status === 'staged-add'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : status === 'staged-delete'
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                : 'bg-neutral-900/80 border-neutral-700/50 text-neutral-300'
            }`}
          >
            {diffData.label}
          </div>
        </foreignObject>
      )}
    </>
  );
};
