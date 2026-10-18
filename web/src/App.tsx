import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { VmCanvas } from '@/components/canvas/VmCanvas';
import { XmlViewerModal } from '@/components/xml/XmlViewerModal';
import { CommandPalette, type PaletteAction } from '@/components/palette/CommandPalette';
import { AddStorageModal } from '@/components/modals/AddStorageModal';
import { AddNetworkModal } from '@/components/modals/AddNetworkModal';
import { AddPciModal } from '@/components/modals/AddPciModal';
import { ConfigureComputeModal } from '@/components/modals/ConfigureComputeModal';
import { RebootNotification } from '@/components/layout/RebootNotification';

import { useDomains, useDomainDetail } from '@/hooks/useDomains';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useHost } from '@/hooks/useHost';
import { useDraftChanges } from '@/hooks/useDraftChanges';
import { Activity, AlertTriangle } from 'lucide-react';
import type { DiskDevice, NetworkInterfaceDevice, PCIDevice, ComputeConfig } from '@/gen/rhino/v1/hardware_pb';

export function App() {
  const { domains, loading: domainsLoading, error: domainsError, refetch: refetchDomains } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [isXmlOpen, setIsXmlOpen] = useState(false);

  // Command palette & modal states
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [storageModalState, setStorageModalState] = useState<{
    isOpen: boolean;
    mode: 'disk' | 'cdrom';
    initialPath?: string;
  }>({ isOpen: false, mode: 'disk' });
  const [networkModalState, setNetworkModalState] = useState<{
    isOpen: boolean;
    initialNetwork?: string;
  }>({ isOpen: false });
  const [pciModalState, setPciModalState] = useState<{
    isOpen: boolean;
    initialDeviceName?: string;
  }>({ isOpen: false });
  const [isComputeModalOpen, setIsComputeModalOpen] = useState(false);
  const [isRebootNotificationOpen, setIsRebootNotificationOpen] = useState(false);

  // Auto-select first domain if none selected
  useEffect(() => {
    if (!selectedDomainId && domains.length > 0) {
      setSelectedDomainId(domains[0].uuid);
    }
  }, [domains, selectedDomainId]);

  const {
    domain,
    refetch: refetchDomain,
    startDomain,
    stopDomain,
    restartDomain,
  } = useDomainDetail(selectedDomainId);

  // Draft Mutations Engine
  const {
    stagedAdditions,
    stagedDeletions,
    isApplying,
    requiresReboot,
    stageAdd,
    unstageAdd,
    toggleDelete,
    discardAll,
    applyChanges,
  } = useDraftChanges(domain);

  // Telemetry stream hooked up to the selected VM
  const { telemetry } = useTelemetry(selectedDomainId, 1000, true);

  const { hostInfo, pools, networks, pciDevices } = useHost();

  // Global Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Action dispatcher from Command Palette
  const handlePaletteAction = useCallback((action: PaletteAction) => {
    switch (action.type) {
      case 'open_storage':
        setStorageModalState({
          isOpen: true,
          mode: action.mode,
          initialPath: action.initialPath,
        });
        break;
      case 'open_network':
        setNetworkModalState({
          isOpen: true,
          initialNetwork: action.initialNetwork,
        });
        break;
      case 'open_pci':
        setPciModalState({
          isOpen: true,
          initialDeviceName: action.initialDeviceName,
        });
        break;
      case 'open_compute':
        setIsComputeModalOpen(true);
        break;
    }
  }, []);

  // Staging callbacks
  const handleStageDisk = useCallback(
    (disk: DiskDevice, rebootRequired: boolean) => {
      stageAdd({
        type: 'storage',
        disk,
        rebootRequired,
        id: disk.id,
        label: `Disk (${disk.targetDev})`,
      });
    },
    [stageAdd]
  );

  const handleStageNetwork = useCallback(
    (iface: NetworkInterfaceDevice, rebootRequired: boolean) => {
      stageAdd({
        type: 'network',
        network: iface,
        rebootRequired,
        id: iface.id,
        label: `vNIC (${iface.source})`,
      });
    },
    [stageAdd]
  );

  const handleStagePci = useCallback(
    (pci: PCIDevice, rebootRequired: boolean) => {
      stageAdd({
        type: 'pci',
        pci,
        rebootRequired,
        id: pci.id,
        label: `PCI (${pci.productName || pci.id})`,
      });
    },
    [stageAdd]
  );

  const handleStageCompute = useCallback(
    (compute: ComputeConfig, rebootRequired: boolean) => {
      stageAdd({
        type: 'compute',
        compute,
        rebootRequired,
        id: 'compute-staged',
        label: `Compute Sizing (${compute.vcpus} vCPUs)`,
      });
    },
    [stageAdd]
  );

  // Apply Changes execution
  const handleApplyChanges = async () => {
    try {
      const res = await applyChanges();
      await refetchDomain();
      await refetchDomains();

      if (res.rebootRequired) {
        setIsRebootNotificationOpen(true);
      }
    } catch (err) {
      console.error('Failed to commit mutations:', err);
    }
  };

  const handleStart = async () => {
    try {
      await startDomain();
      refetchDomains();
    } catch (err) {
      console.error('Failed to start domain:', err);
    }
  };

  const handleStop = async (force = false) => {
    try {
      await stopDomain(force);
      refetchDomains();
    } catch (err) {
      console.error('Failed to stop domain:', err);
    }
  };

  const handleRestart = async (force = false) => {
    try {
      await restartDomain(force);
      refetchDomains();
      setIsRebootNotificationOpen(false);
    } catch (err) {
      console.error('Failed to restart domain:', err);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-neutral-100 overflow-hidden font-sans">
      {/* Top Application Header */}
      <Header
        hostInfo={hostInfo}
        activeDomainName={domain?.summary?.name}
        onNewVm={() => alert('VM Creation Wizard will be implemented in Phase 4!')}
        onOpenPalette={() => setIsPaletteOpen(true)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          domains={domains}
          selectedDomainId={selectedDomainId}
          onSelectDomain={(id) => {
            discardAll();
            setSelectedDomainId(id);
          }}
          storagePoolsCount={pools.length}
          networksCount={networks.length}
          pciDevicesCount={pciDevices.length}
          loading={domainsLoading}
        />

        {/* Center Blueprint Canvas */}
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {domainsError ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <h2 className="text-base font-semibold text-white mb-1">Failed to connect to Rhino API daemon</h2>
              <p className="text-xs text-neutral-400 max-w-md font-mono mb-4">
                {domainsError.message}
              </p>
              <button
                onClick={() => refetchDomains()}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-white border border-white/10 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : domain ? (
            <VmCanvas
              domain={domain}
              telemetry={telemetry}
              onStartDomain={handleStart}
              onStopDomain={handleStop}
              onRestartDomain={handleRestart}
              onAddHardware={() => setIsPaletteOpen(true)}
              onToggleXml={() => setIsXmlOpen(true)}
              isXmlOpen={isXmlOpen}
              stagedAdditions={stagedAdditions}
              stagedDeletions={stagedDeletions}
              onUnstageAdd={unstageAdd}
              onToggleDelete={toggleDelete}
              onDiscardDraft={discardAll}
              onApplyDraft={handleApplyChanges}
              isApplyingDraft={isApplying}
              requiresReboot={requiresReboot}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 text-neutral-500">
              <Activity className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-xs">Loading domain blueprint...</p>
            </div>
          )}
        </main>
      </div>

      {/* Cmd+K Command Palette */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        pools={pools}
        networks={networks}
        pciDevices={pciDevices}
        onSelectAction={handlePaletteAction}
      />

      {/* Add Storage Modal */}
      {domain && (
        <AddStorageModal
          isOpen={storageModalState.isOpen}
          onClose={() => setStorageModalState({ isOpen: false, mode: 'disk' })}
          domain={domain}
          pools={pools}
          initialMode={storageModalState.mode}
          initialSourceFile={storageModalState.initialPath}
          onStageDisk={handleStageDisk}
        />
      )}

      {/* Add Network Interface Modal */}
      {domain && (
        <AddNetworkModal
          isOpen={networkModalState.isOpen}
          onClose={() => setNetworkModalState({ isOpen: false })}
          domain={domain}
          networks={networks}
          initialNetwork={networkModalState.initialNetwork}
          onStageNetwork={handleStageNetwork}
        />
      )}

      {/* Add PCI Hostdev Modal */}
      {domain && (
        <AddPciModal
          isOpen={pciModalState.isOpen}
          onClose={() => setPciModalState({ isOpen: false })}
          domain={domain}
          pciDevices={pciDevices}
          initialDeviceName={pciModalState.initialDeviceName}
          onStagePci={handleStagePci}
        />
      )}

      {/* Configure Compute Modal */}
      {domain && (
        <ConfigureComputeModal
          isOpen={isComputeModalOpen}
          onClose={() => setIsComputeModalOpen(false)}
          domain={domain}
          onStageCompute={handleStageCompute}
        />
      )}

      {/* Libvirt XML Escape Hatch Modal */}
      {domain && (
        <XmlViewerModal
          isOpen={isXmlOpen}
          onClose={() => setIsXmlOpen(false)}
          domainName={domain.summary?.name || 'domain'}
          xml={domain.rawXml}
        />
      )}

      {/* Reboot Notification Toast */}
      {domain && (
        <RebootNotification
          isOpen={isRebootNotificationOpen}
          onClose={() => setIsRebootNotificationOpen(false)}
          onRestart={() => handleRestart(true)}
          vmName={domain.summary?.name || 'VM'}
        />
      )}
    </div>
  );
}

export default App;
