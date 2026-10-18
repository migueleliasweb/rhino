import React, { useState, useMemo } from 'react';
import { create } from '@bufbuild/protobuf';
import { X, HardDrive, Disc, Check, AlertCircle, Sparkles } from 'lucide-react';
import { DiskDeviceSchema, type DiskDevice } from '@/gen/rhino/v1/hardware_pb';
import type { StoragePool } from '@/gen/rhino/v1/host_pb';
import type { DomainDetail } from '@/gen/rhino/v1/vm_pb';
import { formatBytes } from '@/lib/utils';

interface AddStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: DomainDetail;
  pools: StoragePool[];
  initialMode?: 'disk' | 'cdrom';
  initialSourceFile?: string;
  editDisk?: DiskDevice;
  onStageDisk: (disk: DiskDevice, rebootRequired: boolean) => void;
  onSaveEdit?: (originalId: string, updatedDisk: DiskDevice, rebootRequired: boolean) => void;
}

export const AddStorageModal: React.FC<AddStorageModalProps> = ({
  isOpen,
  onClose,
  domain,
  pools,
  initialMode = 'disk',
  initialSourceFile = '',
  editDisk,
  onStageDisk,
  onSaveEdit,
}) => {
  const isEditing = !!editDisk;
  const [deviceType, setDeviceType] = useState<'disk' | 'cdrom'>(
    editDisk ? (editDisk.deviceType === 'cdrom' ? 'cdrom' : 'disk') : initialMode
  );
  const [driverFormat, setDriverFormat] = useState<'qcow2' | 'raw'>(
    (editDisk?.driverFormat as any) || 'qcow2'
  );
  const [bus, setBus] = useState<'virtio' | 'sata' | 'scsi' | 'ide'>(
    (editDisk?.bus as any) || (initialMode === 'cdrom' ? 'sata' : 'virtio')
  );
  const [selectedPoolVolume, setSelectedPoolVolume] = useState<string>(
    editDisk?.sourceFile || initialSourceFile || ''
  );
  const [customPath, setCustomPath] = useState<string>(
    editDisk?.sourceFile || initialSourceFile || ''
  );
  const [useCustomPath, setUseCustomPath] = useState<boolean>(
    !!editDisk?.sourceFile || !initialSourceFile
  );
  const [readonly, setReadonly] = useState<boolean>(
    editDisk ? editDisk.readonly : initialMode === 'cdrom'
  );
  const [bootOrder, setBootOrder] = useState<number>(editDisk?.bootOrder || 0);

  // When editDisk or initial values change and modal opens, reset form state
  React.useEffect(() => {
    if (isOpen) {
      if (editDisk) {
        setDeviceType(editDisk.deviceType === 'cdrom' ? 'cdrom' : 'disk');
        setDriverFormat((editDisk.driverFormat as any) || 'qcow2');
        setBus((editDisk.bus as any) || 'virtio');
        setCustomPath(editDisk.sourceFile || '');
        setSelectedPoolVolume(editDisk.sourceFile || '');
        setUseCustomPath(true);
        setReadonly(editDisk.readonly);
        setBootOrder(editDisk.bootOrder);
        setTargetDev(editDisk.targetDev);
      } else {
        setDeviceType(initialMode);
        setDriverFormat('qcow2');
        setBus(initialMode === 'cdrom' ? 'sata' : 'virtio');
        setSelectedPoolVolume(initialSourceFile || '');
        setCustomPath(initialSourceFile || '');
        setUseCustomPath(!initialSourceFile);
        setReadonly(initialMode === 'cdrom');
        setBootOrder(0);
      }
    }
  }, [isOpen, editDisk, initialMode, initialSourceFile]);

  // Suggest next targetDev (e.g. vda -> vdb, sda -> sdb)
  const suggestedTargetDev = useMemo(() => {
    if (editDisk) return editDisk.targetDev;
    const prefix = bus === 'virtio' ? 'vd' : bus === 'ide' ? 'hd' : 'sd';
    const usedLetters = new Set<string>();

    domain.disks.forEach((d) => {
      if (d.targetDev.startsWith(prefix)) {
        usedLetters.add(d.targetDev.slice(prefix.length));
      }
    });

    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    for (const char of alphabet) {
      if (!usedLetters.has(char)) {
        return `${prefix}${char}`;
      }
    }
    return `${prefix}z`;
  }, [bus, domain.disks, editDisk]);

  const [targetDev, setTargetDev] = useState<string>(editDisk?.targetDev || suggestedTargetDev);

  // When bus changes and not editing, update suggested target dev
  React.useEffect(() => {
    if (!editDisk) {
      setTargetDev(suggestedTargetDev);
    }
  }, [suggestedTargetDev, editDisk]);

  if (!isOpen) return null;

  // Evaluate hotplug compatibility
  const isHotpluggable = bus === 'virtio' || bus === 'scsi';
  const isDomainRunning = domain.summary?.state === 1;
  const requiresReboot = isDomainRunning && !isHotpluggable;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const source = useCustomPath ? customPath.trim() : selectedPoolVolume.trim();
    if (!source) return;

    const disk = create(DiskDeviceSchema, {
      id: `disk-${targetDev}`,
      targetDev: targetDev.trim(),
      deviceType,
      driverFormat,
      sourceFile: source,
      bus,
      readonly,
      bootOrder,
      capacityBytes: 0n,
    });

    if (isEditing && onSaveEdit && editDisk) {
      onSaveEdit(editDisk.id, disk, requiresReboot);
    } else {
      onStageDisk(disk, requiresReboot);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {deviceType === 'cdrom' ? <Disc className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isEditing
                  ? deviceType === 'cdrom'
                    ? 'Edit CD-ROM / ISO Media'
                    : 'Edit Virtual Storage Disk'
                  : deviceType === 'cdrom'
                  ? 'Attach CD-ROM / ISO Media'
                  : 'Attach Virtual Storage Disk'}
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
          {/* Device Type Segmented Control */}
          <div>
            <label className="block text-neutral-400 mb-1.5 font-medium">Device Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-neutral-950 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setDeviceType('disk');
                  setBus('virtio');
                  setReadonly(false);
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                  deviceType === 'disk'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Virtual Disk (HD)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeviceType('cdrom');
                  setBus('sata');
                  setReadonly(true);
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                  deviceType === 'cdrom'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Disc className="w-3.5 h-3.5" />
                <span>CD-ROM (ISO)</span>
              </button>
            </div>
          </div>

          {/* Source Selection (Host Pool vs Custom Path) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-neutral-400 font-medium">Image / Volume Source</label>
              <button
                type="button"
                onClick={() => setUseCustomPath(!useCustomPath)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {useCustomPath ? '← Select from Discovered Pools' : 'Enter Custom Path →'}
              </button>
            </div>

            {!useCustomPath ? (
              <select
                value={selectedPoolVolume}
                onChange={(e) => setSelectedPoolVolume(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              >
                <option value="">-- Choose Discovered Volume --</option>
                {pools.flatMap((pool) =>
                  pool.volumes
                    .filter((v) => deviceType !== 'cdrom' || v.format === 'iso' || v.name.endsWith('.iso'))
                    .map((vol) => (
                      <option key={vol.path} value={vol.path}>
                        {vol.name} ({vol.format}) - {formatBytes(vol.capacityBytes)} [{pool.name}]
                      </option>
                    ))
                )}
              </select>
            ) : (
              <input
                type="text"
                placeholder={deviceType === 'cdrom' ? '/var/lib/libvirt/boot-iso/ubuntu-24.04.iso' : '/var/lib/libvirt/images/disk.qcow2'}
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              />
            )}
          </div>

          {/* Target Dev & Bus Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Target Device</label>
              <input
                type="text"
                value={targetDev}
                onChange={(e) => setTargetDev(e.target.value)}
                placeholder="vda"
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Bus Type</label>
              <select
                value={bus}
                onChange={(e) => setBus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="virtio">VirtIO (Fast, Hotpluggable)</option>
                <option value="scsi">SCSI (Hotpluggable)</option>
                <option value="sata">SATA (Standard for CD-ROM)</option>
                <option value="ide">IDE (Legacy)</option>
              </select>
            </div>
          </div>

          {/* Format & Boot Order Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Driver Format</label>
              <select
                value={driverFormat}
                onChange={(e) => setDriverFormat(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              >
                <option value="qcow2">qcow2 (Thin Provisioned)</option>
                <option value="raw">raw (Direct Block/Raw)</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-400 mb-1.5 font-medium">Boot Order (0 = disabled)</label>
              <input
                type="number"
                min="0"
                max="10"
                value={bootOrder}
                onChange={(e) => setBootOrder(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Readonly Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="storage-readonly"
              checked={readonly}
              onChange={(e) => setReadonly(e.target.checked)}
              className="rounded bg-neutral-950 border-white/20 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="storage-readonly" className="text-neutral-300 cursor-pointer select-none">
              Mount as Read-Only media
            </label>
          </div>

          {/* Hotplug Capability Notice */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              isHotpluggable
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
            }`}
          >
            {isHotpluggable ? (
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            )}
            <div>
              <p className="font-semibold text-[11px]">
                {isHotpluggable ? 'Live Hotplug Permitted' : 'Reboot Required'}
              </p>
              <p className="text-[10px] opacity-80 mt-0.5">
                {isHotpluggable
                  ? `Bus '${bus}' supports dynamic QEMU hotplug without taking down the VM.`
                  : `Bus '${bus}' cannot be hotplugged while the VM is running. Will stage to config.`}
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
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
