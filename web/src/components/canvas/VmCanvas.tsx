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

import type { DomainDetail, TelemetryUpdate } from '@/gen/rhino/v1/vm_pb';

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
}) => {
  // Generate blueprint nodes and edges
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
    if (domain.compute) {
      const compId = 'compute-node';
      nodes.push({
        id: compId,
        type: 'capability',
        position: { x: 60, y: 80 },
        data: {
          type: 'compute',
          compute: domain.compute,
          positionSide: 'left',
        },
      });

      edges.push({
        id: `edge-${compId}-core`,
        source: compId,
        target: 'vm-core',
        type: 'diffEdge',
        data: { status: 'normal' },
      });
    }

    // Storage Nodes (stacked on the left below compute)
    let diskY = 260;
    domain.disks.forEach((disk, idx) => {
      const diskId = disk.id || `disk-${disk.targetDev || idx}`;
      nodes.push({
        id: diskId,
        type: 'capability',
        position: { x: 60, y: diskY },
        data: {
          type: 'storage',
          disk,
          positionSide: 'left',
        },
      });

      edges.push({
        id: `edge-${diskId}-core`,
        source: diskId,
        target: 'vm-core',
        type: 'diffEdge',
        data: { status: 'normal' },
      });

      diskY += 170;
    });

    // Network Nodes (stacked on the right side)
    let netY = 100;
    domain.interfaces.forEach((nic, idx) => {
      const netId = nic.id || `interface-${nic.macAddress.replace(/:/g, '') || idx}`;
      nodes.push({
        id: netId,
        type: 'capability',
        position: { x: 920, y: netY },
        data: {
          type: 'network',
          network: nic,
          positionSide: 'right',
        },
      });

      edges.push({
        id: `edge-core-${netId}`,
        source: 'vm-core',
        target: netId,
        type: 'diffEdge',
        data: { status: 'normal' },
      });

      netY += 170;
    });

    // PCI Passthrough Nodes (stacked on bottom right)
    let pciY = Math.max(netY, 340);
    domain.pciDevices.forEach((pci, idx) => {
      const pciId = pci.id || `hostdev-${pci.domain}_${pci.bus}_${pci.slot}_${pci.function || idx}`;
      nodes.push({
        id: pciId,
        type: 'capability',
        position: { x: 920, y: pciY },
        data: {
          type: 'pci',
          pci,
          positionSide: 'right',
        },
      });

      edges.push({
        id: `edge-core-${pciId}`,
        source: 'vm-core',
        target: pciId,
        type: 'diffEdge',
        data: { status: 'normal' },
      });

      pciY += 170;
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [domain, onStartDomain, onStopDomain, onRestartDomain]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node changes when domain changes, preserving position if already positioned
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

  return (
    <div className="relative w-full h-full bg-[#0c0d12]">
      <CanvasToolbar
        onAddHardware={onAddHardware}
        onToggleXml={onToggleXml}
        isXmlOpen={isXmlOpen}
        isStreaming={!!telemetry}
      />

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
    </div>
  );
};

export const VmCanvas: React.FC<VmCanvasProps> = (props) => (
  <ReactFlowProvider>
    <VmCanvasInner {...props} />
  </ReactFlowProvider>
);
