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
  type NodeChange,
  type NodePositionChange,
  BackgroundVariant,
} from '@xyflow/react';

import { VmCoreNode } from './VmCoreNode';
import { CapabilityNode } from './CapabilityNode';
import { DiffEdge } from './DiffEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { DraftCommitBar } from './DraftCommitBar';

import type { DomainDetail, TelemetryUpdate } from '@/gen/rhino/v1/vm_pb';
import type { StagedAddition, StagedModification } from '@/hooks/useDraftChanges';
import type { DiskDevice, NetworkInterfaceDevice, PCIDevice } from '@/gen/rhino/v1/hardware_pb';

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
  stagedModifications?: Map<string, StagedModification>;
  onUnstageAdd?: (id: string) => void;
  onUnstageModify?: (id: string) => void;
  onToggleDelete?: (id: string) => void;
  onEditCompute?: () => void;
  onEditDisk?: (disk: DiskDevice) => void;
  onEditInterface?: (nic: NetworkInterfaceDevice) => void;
  onEditPci?: (pci: PCIDevice) => void;
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
  stagedModifications = new Map(),
  onUnstageAdd,
  onUnstageModify,
  onToggleDelete,
  onEditCompute,
  onEditDisk,
  onEditInterface,
  onEditPci,
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
    const modifiedCompute = stagedModifications.get('compute-node') || stagedModifications.get('compute');
    const stagedAddCompute = stagedAdditions.find((a) => a.type === 'compute');
    const computeConfig = modifiedCompute?.compute || stagedAddCompute?.compute || domain.compute;
    const isStagedMod = !!modifiedCompute;
    const isStagedAdd = !!stagedAddCompute;

    if (computeConfig) {
      const compId = 'compute-node';

      nodes.push({
        id: compId,
        type: 'capability',
        position: { x: 60, y: 80 },
        data: {
          type: 'compute',
          compute: computeConfig,
          positionSide: 'left',
          status: isStagedMod ? 'staged-modify' : isStagedAdd ? 'staged-add' : 'normal',
          onEdit: onEditCompute,
          onUndoModify: isStagedMod && onUnstageModify ? () => onUnstageModify('compute-node') : undefined,
          onDetach: isStagedAdd && onUnstageAdd ? () => onUnstageAdd(stagedAddCompute.id) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${compId}`,
        source: 'vm-core',
        sourceHandle: 'core-left-out',
        target: compId,
        targetHandle: 'target',
        type: 'diffEdge',
        data: {
          status: isStagedMod ? 'staged-modify' : isStagedAdd ? 'staged-add' : 'normal',
          label: isStagedMod ? '~ Modified' : isStagedAdd ? '+ Staged' : undefined,
        },
      });
    }

    // Storage Nodes (stacked on the left below compute)
    let diskY = 260;

    // 1. Existing disks
    domain.disks.forEach((disk, idx) => {
      const diskId = disk.id || `disk-${disk.targetDev || idx}`;
      const isDeleted = stagedDeletions.has(diskId) || stagedDeletions.has(`disk-${disk.targetDev}`);
      const mod = stagedModifications.get(diskId);
      const activeDisk = mod?.disk || disk;
      const isModified = !isDeleted && !!mod;

      nodes.push({
        id: diskId,
        type: 'capability',
        position: { x: 60, y: diskY },
        data: {
          type: 'storage',
          disk: activeDisk,
          positionSide: 'left',
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(diskId) : undefined,
          onEdit: onEditDisk ? () => onEditDisk(activeDisk) : undefined,
          onUndoModify: isModified && onUnstageModify ? () => onUnstageModify(diskId) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${diskId}`,
        source: 'vm-core',
        sourceHandle: 'core-left-out',
        target: diskId,
        targetHandle: 'target',
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          label: isDeleted ? '- Detach' : isModified ? '~ Modified' : undefined,
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
            onEdit: onEditDisk ? () => onEditDisk(item.disk) : undefined,
          },
        });

        edges.push({
          id: `edge-core-${item.id}`,
          source: 'vm-core',
          sourceHandle: 'core-left-out',
          target: item.id,
          targetHandle: 'target',
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
      const mod = stagedModifications.get(netId);
      const activeNic = mod?.network || nic;
      const isModified = !isDeleted && !!mod;

      nodes.push({
        id: netId,
        type: 'capability',
        position: { x: 920, y: netY },
        data: {
          type: 'network',
          network: activeNic,
          positionSide: 'right',
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(netId) : undefined,
          onEdit: onEditInterface ? () => onEditInterface(activeNic) : undefined,
          onUndoModify: isModified && onUnstageModify ? () => onUnstageModify(netId) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${netId}`,
        source: 'vm-core',
        sourceHandle: 'core-right-out',
        target: netId,
        targetHandle: 'target',
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          label: isDeleted ? '- Detach' : isModified ? '~ Modified' : undefined,
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
            onEdit: onEditInterface ? () => onEditInterface(item.network) : undefined,
          },
        });

        edges.push({
          id: `edge-core-${item.id}`,
          source: 'vm-core',
          sourceHandle: 'core-right-out',
          target: item.id,
          targetHandle: 'target',
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
      const mod = stagedModifications.get(pciId);
      const activePci = mod?.pci || pci;
      const isModified = !isDeleted && !!mod;

      nodes.push({
        id: pciId,
        type: 'capability',
        position: { x: 920, y: pciY },
        data: {
          type: 'pci',
          pci: activePci,
          positionSide: 'right',
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          onDetach: onToggleDelete ? () => onToggleDelete(pciId) : undefined,
          onEdit: onEditPci ? () => onEditPci(activePci) : undefined,
          onUndoModify: isModified && onUnstageModify ? () => onUnstageModify(pciId) : undefined,
        },
      });

      edges.push({
        id: `edge-core-${pciId}`,
        source: 'vm-core',
        sourceHandle: 'core-right-out',
        target: pciId,
        targetHandle: 'target',
        type: 'diffEdge',
        data: {
          status: isDeleted ? 'staged-delete' : isModified ? 'staged-modify' : 'normal',
          label: isDeleted ? '- Detach' : isModified ? '~ Modified' : undefined,
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
            onEdit: onEditPci ? () => onEditPci(item.pci) : undefined,
          },
        });

        edges.push({
          id: `edge-core-${item.id}`,
          source: 'vm-core',
          sourceHandle: 'core-right-out',
          target: item.id,
          targetHandle: 'target',
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
    stagedModifications,
    onUnstageAdd,
    onUnstageModify,
    onToggleDelete,
    onEditCompute,
    onEditDisk,
    onEditInterface,
    onEditPci,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node changes when domain or draft changes, preserving user node coordinates if already positioned
  useEffect(() => {
    setNodes((currentNodes) => {
      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      const corePos = currentMap.get('vm-core')?.position || { x: 420, y: 220 };
      const coreCenterX = corePos.x + 200;

      return initialNodes.map((n) => {
        const existing = currentMap.get(n.id);
        const pos = existing?.position || n.position;
        if (n.id === 'vm-core') {
          return {
            ...n,
            position: pos,
            measured: existing?.measured,
          };
        }
        const isLeft = pos.x + 140 < coreCenterX;
        return {
          ...n,
          position: pos,
          measured: existing?.measured,
          data: {
            ...n.data,
            positionSide: isLeft ? 'left' : 'right',
          },
        };
      });
    });

    setEdges(() => {
      const posMap = new Map(nodes.map((n) => [n.id, n.position]));
      const corePos = posMap.get('vm-core') || { x: 420, y: 220 };
      const coreCenterX = corePos.x + 200;

      return initialEdges.map((edge) => {
        if (edge.source === 'vm-core') {
          const capPos = posMap.get(edge.target);
          if (capPos) {
            const isLeft = capPos.x + 140 < coreCenterX;
            return {
              ...edge,
              sourceHandle: isLeft ? 'core-left-out' : 'core-right-out',
            };
          }
        }
        return edge;
      });
    });
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

  // Dynamic handle flipping & wire re-routing during drag
  const handleNodeDrag = (_: unknown, draggedNode: Node) => {
    setNodes((currentNodes) => {
      const coreNode = currentNodes.find((n) => n.id === 'vm-core');
      const coreCenterX = (coreNode?.position.x ?? 420) + 200;

      if (draggedNode.id === 'vm-core') {
        const newCoreCenterX = draggedNode.position.x + 200;
        return currentNodes.map((n) => {
          if (n.id === 'vm-core') return n;
          const isLeft = n.position.x + 140 < newCoreCenterX;
          const newSide = isLeft ? 'left' : 'right';
          if (n.data?.positionSide !== newSide) {
            return { ...n, data: { ...n.data, positionSide: newSide } };
          }
          return n;
        });
      }

      const isLeft = draggedNode.position.x + 140 < coreCenterX;
      const newSide = isLeft ? 'left' : 'right';

      return currentNodes.map((n) => {
        if (n.id === draggedNode.id && n.data?.positionSide !== newSide) {
          return { ...n, data: { ...n.data, positionSide: newSide } };
        }
        return n;
      });
    });

    setEdges((currentEdges) => {
      const coreNode = nodes.find((n) => n.id === 'vm-core');
      const coreCenterX = (coreNode?.position.x ?? 420) + 200;

      return currentEdges.map((edge) => {
        if (edge.source !== 'vm-core') return edge;
        const capNode = nodes.find((n) => n.id === edge.target);
        if (!capNode) return edge;
        const nodeX = capNode.id === draggedNode.id ? draggedNode.position.x : capNode.position.x;
        const isLeft = nodeX + 140 < coreCenterX;
        const expectedHandle = isLeft ? 'core-left-out' : 'core-right-out';
        if (edge.sourceHandle !== expectedHandle) {
          return { ...edge, sourceHandle: expectedHandle };
        }
        return edge;
      });
    });
  };

  const handleNodesChange = (changes: NodeChange<Node>[]) => {
    onNodesChange(changes);

    const posChanges = changes.filter((c): c is NodePositionChange => c.type === 'position' && !!c.position);
    if (posChanges.length === 0) return;

    setNodes((currentNodes) => {
      const coreNode = currentNodes.find((n) => n.id === 'vm-core');
      const coreCenterX = (coreNode?.position.x ?? 420) + 200;

      let hasSideChanges = false;
      const updated = currentNodes.map((node) => {
        if (node.id === 'vm-core') return node;
        const isLeft = node.position.x + 140 < coreCenterX;
        const expectedSide = isLeft ? 'left' : 'right';
        if (node.data?.positionSide !== expectedSide) {
          hasSideChanges = true;
          return {
            ...node,
            data: {
              ...node.data,
              positionSide: expectedSide,
            },
          };
        }
        return node;
      });

      if (hasSideChanges) {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            if (edge.source !== 'vm-core') return edge;
            const capNode = updated.find((n) => n.id === edge.target);
            if (!capNode) return edge;
            const isLeft = capNode.position.x + 140 < coreCenterX;
            const expectedHandle = isLeft ? 'core-left-out' : 'core-right-out';
            if (edge.sourceHandle !== expectedHandle) {
              return { ...edge, sourceHandle: expectedHandle };
            }
            return edge;
          })
        );
        return updated;
      }

      return currentNodes;
    });
  };

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

  const hasDraftChanges =
    stagedAdditions.length > 0 || stagedDeletions.size > 0 || stagedModifications.size > 0;

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
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDrag}
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
            if (status === 'staged-modify') return '#f59e0b';
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
          stagedModifications={stagedModifications}
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
