import React, { useState, useMemo } from 'react';
import { create } from '@bufbuild/protobuf';
import { X, Zap, Check, ShieldAlert } from 'lucide-react';
import { PCIDeviceSchema, type PCIDevice } from '@/gen/rhino/v1/hardware_pb';
import type { HostNodeDevice } from '@/gen/rhino/v1/host_pb';
import type { DomainDetail } from '@/gen/rhino/v1/vm_pb';

interface AddPciModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: DomainDetail;
  pciDevices: HostNodeDevice[];
  initialDeviceName?: string;
  onStagePci: (pci: PCIDevice, rebootRequired: boolean) => void;
}

export const AddPciModal: React.FC<AddPciModalProps> = ({
  isOpen,
  onClose,
  domain,
  pciDevices,
  initialDeviceName = '',
  onStagePci,
}) => {
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>(
    initialDeviceName || (pciDevices.length > 0 ? pciDevices[0].name : '')
  );

  const selectedDevice = useMemo(() => {
    return pciDevices.find((d) => d.name === selectedDeviceName) || pciDevices[0];
  }, [pciDevices, selectedDeviceName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    const pci = create(PCIDeviceSchema, {
      id: `hostdev-${selectedDevice.domain}_${selectedDevice.bus}_${selectedDevice.slot}_${selectedDevice.function}`,
      domain: selectedDevice.domain || '0x0000',
      bus: selectedDevice.bus || '0x00',
      slot: selectedDevice.slot || '0x00',
      function: selectedDevice.function || '0x0',
      vendorId: selectedDevice.vendorId,
      productId: selectedDevice.productId,
      vendorName: selectedDevice.vendorName,
      productName: selectedDevice.productName,
      iommuGroup: selectedDevice.iommuGroup,
    });

    onStagePci(pci, true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Attach Host PCI Device (VFIO Passthrough)</h2>
              <p className="text-xs text-neutral-400">Target VM: <span className="text-neutral-200 font-medium">{domain.summary?.name}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Host PCI Device Selector */}
          <div>
            <label className="block text-neutral-400 mb-1.5 font-medium">Discovered Host PCI Hardware</label>
            <select
              value={selectedDeviceName}
              onChange={(e) => setSelectedDeviceName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              required
            >
              {pciDevices.map((dev) => (
                <option key={dev.name} value={dev.name}>
                  {dev.vendorName} {dev.productName} [{dev.domain}:{dev.bus}:{dev.slot}.{dev.function}] (IOMMU {dev.iommuGroup})
                </option>
              ))}
              {pciDevices.length === 0 && (
                <option value="">No host PCI passthrough devices found</option>
              )}
            </select>
          </div>

          {/* Selected Device Details Card */}
          {selectedDevice && (
            <div className="p-4 rounded-xl bg-neutral-950/80 border border-white/10 space-y-2">
              <div className="text-white font-semibold text-sm">
                {selectedDevice.vendorName} {selectedDevice.productName}
              </div>
              <div className="grid grid-cols-2 gap-2 text-neutral-400 font-mono text-[11px] pt-1 border-t border-white/5">
                <div>
                  <span className="text-neutral-500">PCI Address:</span>{' '}
                  <span className="text-amber-400">
                    {selectedDevice.domain}:{selectedDevice.bus}:{selectedDevice.slot}.{selectedDevice.function}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">IOMMU Group:</span>{' '}
                  <span className="text-neutral-200">Group {selectedDevice.iommuGroup}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Vendor ID:</span>{' '}
                  <span className="text-neutral-200">{selectedDevice.vendorId}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Product ID:</span>{' '}
                  <span className="text-neutral-200">{selectedDevice.productId}</span>
                </div>
              </div>
            </div>
          )}

          {/* Mandatory Reboot Notice */}
          <div className="p-3.5 rounded-xl border bg-amber-950/40 border-amber-500/40 text-amber-200 flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold text-xs text-amber-300">Reboot Required for Activation</p>
              <p className="text-[11px] opacity-90 mt-1 leading-relaxed">
                PCI Host Devices cannot be attached live in QEMU due to IOMMU isolation and memory re-mapping constraints. This modification will be staged to the domain configuration and will take effect when the VM is restarted.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedDevice}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white shadow-lg shadow-amber-950/50 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Stage to Canvas</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
