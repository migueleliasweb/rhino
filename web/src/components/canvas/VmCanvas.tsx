import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';

import { VmCoreNode } from './VmCoreNode';
import { CapabilityNode } from './CapabilityNode';
import { DiffEdge } from './DiffEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { DraftCommitBar } from './DraftCommitBar';

import type { DomainDetail, TelemetryUpdate } from '@/gen/rhino/v1/vm_pb';
import type { StagedAddition } from '@/hooks/useDraftChanges';

const nodeTypes = {
  vmCore: VmCoreNode,
  capability: CapabilityNode,
};

const edgeTypes = {
  diffEdge: DiffEdge,
};

interface VmCanvasProps {
  domain: DomainDetail;
  telemetry: TelemetryUpdate | null;
  onStartDomain: () => void;
  onStopDomain: (force?: boolean) => void;
  onRestartDomain: (force?: boolean) => void;
  onAddHardware?: () => void;
  onToggleXml?: () => void;
  isXmlOpen?: boolean;
  stagedAdditions?: StagedAddition[];
  stagedDeletions?: Set<string>;
  onUnstageAdd?: (id: string) => void;
  onToggleDelete?: (id: string) => void;
  onDiscardDraft?: () => void;
  onApplyDraft?: () => void;
  isApplyingDraft?: boolean;
  requiresReboot?: boolean;
}

const VmCanvasInner: React.FC<VmCanvasProps> = ({
  domain,
  telemetry,
  onStartDomain,
  onStopDomain,
  onRestartDomain,
  onAddHardware,
  onToggleXml,
  isXmlOpen,
  stagedAdditions = [],
  stagedDeletions = new Set(),
  onUnstageAdd,
  onToggleDelete,
  onDiscardDraft,
  onApplyDraft,
  isApplyingDraft = false,
  requiresReboot = false,
}) => {
  // Generate blueprint nodes and edges combining committed base domain and draft mutations
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Central Core Node
    const coreX = 420;
    const coreY = 220;

    nodes.push({
      id: 'vm-core',
      type: 'vmCore',
      position: { x: coreX, y: coreY },
      data: {
        domain,
        telemetry,
        onStart: onStartDomain,
        onStop: onStopDomain,
        onRestart: onRestartDomain,
      },
    });

    // Compute Node (top-left)
    // Check if compute was staged for reconfiguration
    const stagedCompute = stagedAdditions.find((a) => a.type === 'compute');
    const computeConfig = stagedCompute?.compute || domain.compute;

    if (computeConfig) {
      const compId = stagedCompute ? stagedCompute.id : 'compute-node';
      const isStaged = !!stagedCompute;

      nodes.push({
        id: compId,
        type: 'capability',
        position: { x: 60, y: 80 },
        data: {
          type: 'compute',
          compute: computeConfig,
          positionSide: 'left',
          status: isStaged ? 'staged-add' : 'normal',
          onDetach: isStaged && onUnstageAdd ? () => onUnstageAdd(stagedCompute.id) : undefined,
        },
      });

      edges.push({
        id: `edge-${compId}-core`,
        source: compId,
        target: 'vm-core',
        type: 'diffEdge',
        data: {
          status: isStaged ? 'staged-add' : 'normal',
          label: isStaged ? '+ Staged' : undefined,
        },
      });
    }

    // Storage Nodes (stacked on the left below compute)
    let diskY = 260;

    // 1. Existing disks
    domain.disks.forEach((disk, idx) => {
      const diskId = disk.id || `disk-${disk.targetDev || idx}`;
      const isDeleted = stagedDeletions.has(diskId) || stagedDeletions.has(`disk-${disk.targetDev}`);

      nodes.push({
        id: diskId,
        type: 'capability',
        position: { x: 60, y: diskY },
        data: {
          type: 'storage',
          disk,
          positionSide: 'left',
          status: isDeleted ? 'staged-delete' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(diskId) : undefined,
        },
      });

      edges.push({
        id: `edge-${diskId}-core`,
        source: diskId,
        target: 'vm-core',
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : 'normal',
          label: isDeleted ? '- Detach' : undefined,
        },
      });

      diskY += 170;
    });

    // 2. Staged addition disks
    stagedAdditions
      .filter((a) => a.type === 'storage')
      .forEach((item) => {
        nodes.push({
          id: item.id,
          type: 'capability',
          position: { x: 60, y: diskY },
          data: {
            type: 'storage',
            disk: item.disk,
            positionSide: 'left',
            status: 'staged-add',
            onDetach: onUnstageAdd ? () => onUnstageAdd(item.id) : undefined,
          },
        });

        edges.push({
          id: `edge-${item.id}-core`,
          source: item.id,
          target: 'vm-core',
          type: 'diffEdge',
          data: {
            status: 'staged-add',
            label: '+ Staged',
          },
        });

        diskY += 170;
      });

    // Network Nodes (stacked on the right side)
    let netY = 100;

    // 1. Existing interfaces
    domain.interfaces.forEach((nic, idx) => {
      const netId = nic.id || `interface-${nic.macAddress.replace(/:/g, '') || idx}`;
      const isDeleted = stagedDeletions.has(netId);

      nodes.push({
        id: netId,
        type: 'capability',
        position: { x: 920, y: netY },
        data: {
          type: 'network',
          network: nic,
          positionSide: 'right',
          status: isDeleted ? 'staged-delete' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(netId) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${netId}`,
        source: 'vm-core',
        target: netId,
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : 'normal',
          label: isDeleted ? '- Detach' : undefined,
        },
      });

      netY += 170;
    });

    // 2. Staged addition interfaces
    stagedAdditions
      .filter((a) => a.type === 'network')
      .forEach((item) => {
        nodes.push({
          id: item.id,
          type: 'capability',
          position: { x: 920, y: netY },
          data: {
            type: 'network',
            network: item.network,
            positionSide: 'right',
            status: 'staged-add',
            onDetach: onUnstageAdd ? () => onUnstageAdd(item.id) : undefined,
          },
        });

        edges.push({
          id: `edge-core-${item.id}`,
          source: 'vm-core',
          target: item.id,
          type: 'diffEdge',
          data: {
            status: 'staged-add',
            label: '+ Staged',
          },
        });

        netY += 170;
      });

    // PCI Passthrough Nodes (stacked on bottom right)
    let pciY = Math.max(netY, 340);

    // 1. Existing PCI devices
    domain.pciDevices.forEach((pci, idx) => {
      const pciId = pci.id || `hostdev-${pci.domain}_${pci.bus}_${pci.slot}_${pci.function || idx}`;
      const isDeleted = stagedDeletions.has(pciId);

      nodes.push({
        id: pciId,
        type: 'capability',
        position: { x: 920, y: pciY },
        data: {
          type: 'pci',
          pci,
          positionSide: 'right',
          status: isDeleted ? 'staged-delete' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(pciId) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${pciId}`,
        source: 'vm-core',
        target: pciId,
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : 'normal',
          label: isDeleted ? '- Detach' : undefined,
        },
      });

      pciY += 170;
    });

    // 2. Staged addition PCI devices
    stagedAdditions
      .filter((a) => a.type === 'pci')
      .forEach((item) => {
        nodes.push({
          id: item.id,
          type: 'capability',
          position: { x: 920, y: pciY },
          data: {
            type: 'pci',
            pci: item.pci,
            positionSide: 'right',
            status: 'staged-add',
            onDetach: onUnstageAdd ? () => onUnstageAdd(item.id) : undefined,
          },
        });

        edges.push({
          id: `edge-core-${item.id}`,
          source: 'vm-core',
          target: item.id,
          type: 'diffEdge',
          data: {
            status: 'staged-add',
            label: '+ Staged',
          },
        });

        pciY += 170;
      });

    return { initialNodes: nodes, initialEdges: edges };
  }, [
    domain,
    onStartDomain,
    onStopDomain,
    onRestartDomain,
    stagedAdditions,
    stagedDeletions,
    onUnstageAdd,
    onToggleDelete,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node changes when domain or draft changes, preserving user node coordinates if already positioned
  useEffect(() => {
    setNodes((currentNodes) => {
      const posMap = new Map(currentNodes.map((n) => [n.id, n.position]));
      return initialNodes.map((n) => ({
        ...n,
        position: posMap.get(n.id) || n.position,
      }));
    });
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Keep live telemetry in vm-core node updated
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === 'vm-core') {
          return {
            ...node,
            data: {
              ...node.data,
              telemetry,
              domain,
            },
          };
        }
        return node;
      })
    );
  }, [telemetry, domain, setNodes]);

  const onConnect = (params: Connection) =>
    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: 'diffEdge',
          data: { status: 'staged-add', label: '+ Staged' },
        },
        eds
      )
    );

  const hasDraftChanges = stagedAdditions.length > 0 || stagedDeletions.size > 0;

  return (
    <div className="relative w-full h-full bg-[#0c0d12]">
      {/* Top action toolbar */}
      <CanvasToolbar
        onAddHardware={onAddHardware}
        onToggleXml={onToggleXml}
        isXmlOpen={isXmlOpen}
        isStreaming={!!telemetry}
      />

      {/* React Flow Blueprint Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#27272a" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            if (node.id === 'vm-core') return '#6366f1';
            const capType = (node.data as any)?.type;
            const status = (node.data as any)?.status;
            if (status === 'staged-add') return '#10b981';
            if (status === 'staged-delete') return '#f43f5e';
            if (capType === 'storage') return '#10b981';
            if (capType === 'network') return '#0ea5e9';
            if (capType === 'compute') return '#a855f7';
            if (capType === 'pci') return '#f59e0b';
            return '#71717a';
          }}
          maskColor="rgba(12, 13, 18, 0.75)"
          className="!bottom-4 !left-4 !rounded-xl !border !border-white/10 !bg-neutral-900/80 !backdrop-blur-md overflow-hidden shadow-2xl"
        />
      </ReactFlow>

      {/* Floating Draft & Commit Dock */}
      {hasDraftChanges && onDiscardDraft && onApplyDraft && (
        <DraftCommitBar
          hasChanges={hasDraftChanges}
          stagedAdditions={stagedAdditions}
          stagedDeletions={stagedDeletions}
          requiresReboot={requiresReboot}
          isApplying={isApplyingDraft}
          onDiscard={onDiscardDraft}
          onApply={onApplyDraft}
        />
      )}
    </div>
  );
};

export const VmCanvas: React.FC<VmCanvasProps> = (props) => (
  <ReactFlowProvider>
    <VmCanvasInner {...props} />
  </ReactFlowProvider>
);
