import { useState, useCallback, useMemo, useEffect } from 'react';
import { hardwareClient } from '@/lib/connect';
import type { DiskDevice, NetworkInterfaceDevice, PCIDevice, ComputeConfig } from '@/gen/rhino/v1/hardware_pb';
import type { DomainDetail } from '@/gen/rhino/v1/vm_pb';
import { DomainState } from '@/gen/rhino/v1/vm_pb';

export type StagedAddition =
  | { type: 'storage'; disk: DiskDevice; rebootRequired: boolean; id: string; label: string }
  | { type: 'network'; network: NetworkInterfaceDevice; rebootRequired: boolean; id: string; label: string }
  | { type: 'pci'; pci: PCIDevice; rebootRequired: boolean; id: string; label: string }
  | { type: 'compute'; compute: ComputeConfig; rebootRequired: boolean; id: string; label: string };

export type StagedModification =
  | { type: 'storage'; originalId: string; disk: DiskDevice; rebootRequired: boolean; label: string }
  | { type: 'network'; originalId: string; network: NetworkInterfaceDevice; rebootRequired: boolean; label: string }
  | { type: 'pci'; originalId: string; pci: PCIDevice; rebootRequired: boolean; label: string }
  | { type: 'compute'; originalId: string; compute: ComputeConfig; rebootRequired: boolean; label: string };

export interface ApplyResult {
  success: boolean;
  rebootRequired: boolean;
  errors: string[];
}

export function useDraftChanges(domain: DomainDetail | null) {
  const [stagedAdditions, setStagedAdditions] = useState<StagedAddition[]>([]);
  const [stagedDeletions, setStagedDeletions] = useState<Set<string>>(new Set());
  const [stagedModifications, setStagedModifications] = useState<Map<string, StagedModification>>(new Map());
  const [isApplying, setIsApplying] = useState(false);

  // Clear draft changes when domain ID changes
  const currentDomainId = domain?.summary?.uuid || domain?.summary?.name;
  useEffect(() => {
    setStagedAdditions([]);
    setStagedDeletions(new Set());
    setStagedModifications(new Map());
  }, [currentDomainId]);

  const stageAdd = useCallback((item: StagedAddition) => {
    setStagedAdditions((prev) => [...prev.filter((i) => i.id !== item.id), item]);
  }, []);

  const unstageAdd = useCallback((id: string) => {
    setStagedAdditions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const stageDelete = useCallback((id: string) => {
    setStagedDeletions((prev) => new Set([...prev, id]));
  }, []);

  const unstageDelete = useCallback((id: string) => {
    setStagedDeletions((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleDelete = useCallback((id: string) => {
    setStagedDeletions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const stageModify = useCallback((item: StagedModification) => {
    setStagedModifications((prev) => new Map(prev).set(item.originalId, item));
    // If it was marked for deletion, un-mark it
    setStagedDeletions((prev) => {
      if (prev.has(item.originalId)) {
        const next = new Set(prev);
        next.delete(item.originalId);
        return next;
      }
      return prev;
    });
  }, []);

  const unstageModify = useCallback((originalId: string) => {
    setStagedModifications((prev) => {
      const next = new Map(prev);
      next.delete(originalId);
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    setStagedAdditions([]);
    setStagedDeletions(new Set());
    setStagedModifications(new Map());
  }, []);

  const hasChanges =
    stagedAdditions.length > 0 || stagedDeletions.size > 0 || stagedModifications.size > 0;
  const changeCount =
    stagedAdditions.length + stagedDeletions.size + stagedModifications.size;

  const isRunning = domain?.summary?.state === DomainState.RUNNING;

  // Evaluate if any change requires reboot
  const requiresReboot = useMemo(() => {
    if (!isRunning) return false;
    for (const item of stagedAdditions) {
      if (item.rebootRequired) return true;
    }
    for (const item of stagedModifications.values()) {
      if (item.rebootRequired) return true;
    }
    // PCI or compute changes always require reboot
    if (stagedAdditions.some((i) => i.type === 'pci' || i.type === 'compute')) return true;
    for (const item of stagedModifications.values()) {
      if (item.type === 'pci' || item.type === 'compute') return true;
    }
    return false;
  }, [isRunning, stagedAdditions, stagedModifications]);

  const applyChanges = useCallback(async (): Promise<ApplyResult> => {
    if (!domain || !domain.summary) {
      return { success: false, rebootRequired: false, errors: ['No active domain'] };
    }

    const domainNameOrId = domain.summary.name || domain.summary.uuid;
    const errors: string[] = [];
    let anyRebootRequired = false;

    setIsApplying(true);

    try {
      // 1. Process Staged Modifications
      for (const [origId, mod] of stagedModifications.entries()) {
        try {
          if (mod.type === 'compute') {
            const res = await hardwareClient.updateComputeConfig({
              domainId: domainNameOrId,
              compute: mod.compute,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          } else if (mod.type === 'storage') {
            const oldDisk = domain.disks.find((d) => d.id === origId || `disk-${d.targetDev}` === origId);
            // If it's a CD-ROM media swap with the same targetDev, attach with update
            if (oldDisk && oldDisk.deviceType === 'cdrom' && oldDisk.targetDev === mod.disk.targetDev) {
              const res = await hardwareClient.attachDisk({
                domainId: domainNameOrId,
                disk: mod.disk,
                live: isRunning,
              });
              if (res.rebootRequired) anyRebootRequired = true;
            } else {
              // Recreate: detach old then attach new
              if (oldDisk) {
                await hardwareClient.detachDisk({
                  domainId: domainNameOrId,
                  targetDev: oldDisk.targetDev,
                  live: isRunning,
                });
              }
              const res = await hardwareClient.attachDisk({
                domainId: domainNameOrId,
                disk: mod.disk,
                live: isRunning,
              });
              if (res.rebootRequired) anyRebootRequired = true;
            }
          } else if (mod.type === 'network') {
            const oldIface = domain.interfaces.find(
              (n) => n.id === origId || `interface-${n.macAddress.replace(/:/g, '')}` === origId
            );
            if (oldIface) {
              await hardwareClient.detachNetworkInterface({
                domainId: domainNameOrId,
                macAddress: oldIface.macAddress,
                live: isRunning,
              });
            }
            const res = await hardwareClient.attachNetworkInterface({
              domainId: domainNameOrId,
              interface: mod.network,
              live: isRunning,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          } else if (mod.type === 'pci') {
            const oldPci = domain.pciDevices.find((p) => p.id === origId);
            if (oldPci) {
              await hardwareClient.detachPCIDevice({
                domainId: domainNameOrId,
                deviceId: oldPci.slot,
                live: isRunning,
              });
            }
            const res = await hardwareClient.attachPCIDevice({
              domainId: domainNameOrId,
              pciDevice: mod.pci,
              live: isRunning,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to update ${mod.label}: ${msg}`);
        }
      }

      // 2. Process Staged Additions
      for (const item of stagedAdditions) {
        try {
          if (item.type === 'storage') {
            const res = await hardwareClient.attachDisk({
              domainId: domainNameOrId,
              disk: item.disk,
              live: isRunning,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          } else if (item.type === 'network') {
            const res = await hardwareClient.attachNetworkInterface({
              domainId: domainNameOrId,
              interface: item.network,
              live: isRunning,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          } else if (item.type === 'pci') {
            const res = await hardwareClient.attachPCIDevice({
              domainId: domainNameOrId,
              pciDevice: item.pci,
              live: isRunning,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          } else if (item.type === 'compute') {
            const res = await hardwareClient.updateComputeConfig({
              domainId: domainNameOrId,
              compute: item.compute,
            });
            if (res.rebootRequired) anyRebootRequired = true;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to attach ${item.label}: ${msg}`);
        }
      }

      // 3. Process Staged Deletions
      for (const delId of stagedDeletions) {
        try {
          const disk = domain.disks.find((d) => d.id === delId || `disk-${d.targetDev}` === delId);
          if (disk) {
            await hardwareClient.detachDisk({
              domainId: domainNameOrId,
              targetDev: disk.targetDev,
              live: isRunning,
            });
            continue;
          }

          const iface = domain.interfaces.find(
            (n) => n.id === delId || `interface-${n.macAddress.replace(/:/g, '')}` === delId
          );
          if (iface) {
            await hardwareClient.detachNetworkInterface({
              domainId: domainNameOrId,
              macAddress: iface.macAddress,
              live: isRunning,
            });
            continue;
          }

          const pci = domain.pciDevices.find((p) => p.id === delId);
          if (pci) {
            await hardwareClient.detachPCIDevice({
              domainId: domainNameOrId,
              deviceId: pci.slot,
              live: isRunning,
            });
            anyRebootRequired = true;
            continue;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to detach ${delId}: ${msg}`);
        }
      }

      // If changes succeeded (or partial), clear what was processed
      if (errors.length === 0) {
        discardAll();
      }

      return {
        success: errors.length === 0,
        rebootRequired: anyRebootRequired,
        errors,
      };
    } finally {
      setIsApplying(false);
    }
  }, [domain, stagedAdditions, stagedDeletions, stagedModifications, isRunning, discardAll]);

  return {
    stagedAdditions,
    stagedDeletions,
    stagedModifications,
    isApplying,
    hasChanges,
    changeCount,
    requiresReboot,
    stageAdd,
    unstageAdd,
    stageDelete,
    unstageDelete,
    toggleDelete,
    stageModify,
    unstageModify,
    discardAll,
    applyChanges,
  };
}
