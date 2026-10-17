import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { VmCanvas } from '@/components/canvas/VmCanvas';
import { XmlViewerModal } from '@/components/xml/XmlViewerModal';
import { useDomains, useDomainDetail } from '@/hooks/useDomains';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useHost } from '@/hooks/useHost';
import { Activity, AlertTriangle } from 'lucide-react';

export function App() {
  const { domains, loading: domainsLoading, error: domainsError, refetch: refetchDomains } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [isXmlOpen, setIsXmlOpen] = useState(false);

  // Auto-select first domain if none selected
  useEffect(() => {
    if (!selectedDomainId && domains.length > 0) {
      setSelectedDomainId(domains[0].uuid);
    }
  }, [domains, selectedDomainId]);

  const {
    domain,
    startDomain,
    stopDomain,
    restartDomain,
  } = useDomainDetail(selectedDomainId);

  // Telemetry stream hooked up to the selected VM
  const { telemetry } = useTelemetry(selectedDomainId, 1000, true);

  const { hostInfo, pools, networks, pciDevices } = useHost();

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
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          domains={domains}
          selectedDomainId={selectedDomainId}
          onSelectDomain={setSelectedDomainId}
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
              onAddHardware={() => alert('Search-to-Capability (Cmd+K) mutation engine will be implemented in Phase 3!')}
              onToggleXml={() => setIsXmlOpen(true)}
              isXmlOpen={isXmlOpen}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 text-neutral-500">
              <Activity className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-xs">Loading domain blueprint...</p>
            </div>
          )}
        </main>
      </div>

      {/* Libvirt XML Escape Hatch Modal */}
      {domain && (
        <XmlViewerModal
          isOpen={isXmlOpen}
          onClose={() => setIsXmlOpen(false)}
          domainName={domain.summary?.name || 'domain'}
          xml={domain.rawXml}
        />
      )}
    </div>
  );
}
export default App;
