import React, { useState } from 'react';
import { create } from '@bufbuild/protobuf';
import { X, Network, RefreshCw, Check, Sparkles } from 'lucide-react';
import { NetworkInterfaceDeviceSchema, type NetworkInterfaceDevice } from '@/gen/rhino/v1/hardware_pb';
import type { VirtualNetwork } from '@/gen/rhino/v1/host_pb';
import type { DomainDetail } from '@/gen/rhino/v1/vm_pb';

interface AddNetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: DomainDetail;
  networks: VirtualNetwork[];
  initialNetwork?: string;
  editInterface?: NetworkInterfaceDevice;
  onStageNetwork: (iface: NetworkInterfaceDevice, rebootRequired: boolean) => void;
  onSaveEdit?: (originalId: string, updatedIface: NetworkInterfaceDevice, rebootRequired: boolean) => void;
}

function generateMac(): string {
  const hex = '0123456789abcdef';
  let mac = '52:54:00';
  for (let i = 0; i < 3; i++) {
    mac += `:${hex[Math.floor(Math.random() * 16)]}${hex[Math.floor(Math.random() * 16)]}`;
  }
  return mac;
}

export const AddNetworkModal: React.FC<AddNetworkModalProps> = ({
  isOpen,
  onClose,
  domain,
  networks,
  initialNetwork = '',
  editInterface,
  onStageNetwork,
  onSaveEdit,
}) => {
  const isEditing = !!editInterface;
  const [source, setSource] = useState<string>(
    editInterface?.source || initialNetwork || (networks.length > 0 ? networks[0].name : 'default')
  );
  const [interfaceType, setInterfaceType] = useState<'network' | 'bridge'>(
    (editInterface?.interfaceType as any) || 'network'
  );
  const [model, setModel] = useState<string>(editInterface?.model || 'virtio');
  const [macAddress, setMacAddress] = useState<string>(editInterface?.macAddress || generateMac());

  React.useEffect(() => {
    if (isOpen) {
      if (editInterface) {
        setSource(editInterface.source);
        setInterfaceType((editInterface.interfaceType as any) || 'network');
        setModel(editInterface.model || 'virtio');
        setMacAddress(editInterface.macAddress);
      } else {
        setSource(initialNetwork || (networks.length > 0 ? networks[0].name : 'default'));
        setInterfaceType('network');
        setModel('virtio');
        setMacAddress(generateMac());
      }
    }
  }, [isOpen, editInterface, initialNetwork, networks]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return;

    const iface = create(NetworkInterfaceDeviceSchema, {
      id: editInterface?.id || `interface-${macAddress.replace(/:/g, '')}`,
      macAddress,
      interfaceType,
      source,
      model,
      ipAddresses: editInterface?.ipAddresses || [],
    });

    if (isEditing && onSaveEdit && editInterface) {
      onSaveEdit(editInterface.id, iface, false);
    } else {
      onStageNetwork(iface, false);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isEditing ? 'Edit Virtual Network Interface (vNIC)' : 'Attach Virtual Network Interface (vNIC)'}
              </h2>
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
          {/* Source Network / Bridge */}
          <div>
            <label className="block text-neutral-400 mb-1.5 font-medium">Network Source</label>
            <select
              value={source}
              onChange={(e) => {
                const val = e.target.value;
                setSource(val);
                const matched = networks.find((n) => n.name === val);
                if (matched?.forwardMode === 'bridge') {
                  setInterfaceType('bridge');
                } else {
                  setInterfaceType('network');
                }
              }}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              required
            >
              {networks.map((net) => (
                <option key={net.name} value={net.name}>
                  {net.name} ({net.forwardMode.toUpperCase()}) {net.bridgeName ? `• ${net.bridgeName}` : ''} {net.active ? '• Active' : '• Inactive'}
                </option>
              ))}
              {networks.length === 0 && <option value="default">default (NAT)</option>}
            </select>
          </div>

          {/* Interface Type & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Interface Type</label>
              <select
                value={interfaceType}
                onChange={(e) => setInterfaceType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="network">Virtual Network (NAT/Isolated)</option>
                <option value="bridge">Host Bridge (br0/Direct)</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">vNIC Device Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="virtio">virtio-net-pci (High Performance)</option>
                <option value="e1000">Intel e1000 (Legacy Compatibility)</option>
                <option value="rtl8139">Realtek rtl8139</option>
              </select>
            </div>
          </div>

          {/* MAC Address with Generator */}
          <div>
            <label className="block text-neutral-400 mb-1.5 font-medium">MAC Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="52:54:00:xx:xx:xx"
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              />
              <button
                type="button"
                onClick={() => setMacAddress(generateMac())}
                title="Generate Random MAC"
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gen</span>
              </button>
            </div>
          </div>

          {/* Live Hotplug Notice */}
          <div className="p-3 rounded-xl border bg-sky-950/30 border-sky-500/30 text-sky-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
            <div>
              <p className="font-semibold text-[11px]">VirtIO Live Hotplug Ready</p>
              <p className="text-[10px] opacity-80 mt-0.5">
                QEMU will hotplug this virtual NIC into a live PCI slot without restarting the guest OS.
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950/50 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Save Modifications' : 'Stage to Canvas'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
