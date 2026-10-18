import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  HardDrive,
  Disc,
  Network,
  Zap,
  Cpu,
  ChevronRight,
  Database,
  ArrowRight,
  Command,
} from 'lucide-react';
import type { StoragePool, VirtualNetwork, HostNodeDevice } from '@/gen/rhino/v1/host_pb';
import { formatBytes } from '@/lib/utils';

export type PaletteAction =
  | { type: 'open_storage'; mode: 'disk' | 'cdrom'; initialPath?: string }
  | { type: 'open_network'; initialNetwork?: string }
  | { type: 'open_pci'; initialDeviceName?: string }
  | { type: 'open_compute' };

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  pools: StoragePool[];
  networks: VirtualNetwork[];
  pciDevices: HostNodeDevice[];
  onSelectAction: (action: PaletteAction) => void;
}

interface PaletteItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  badge?: string;
  action: PaletteAction;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  pools,
  networks,
  pciDevices,
  onSelectAction,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Construct palette items
  const items: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [
      // Quick Capabilities
      {
        id: 'action-disk',
        category: 'Capabilities',
        title: 'Add Virtual Disk',
        subtitle: 'Attach a new QCOW2 or Raw virtual disk drive',
        icon: HardDrive,
        iconColor: 'text-emerald-400',
        badge: 'Storage',
        action: { type: 'open_storage', mode: 'disk' },
      },
      {
        id: 'action-cdrom',
        category: 'Capabilities',
        title: 'Attach CD-ROM / Boot ISO',
        subtitle: 'Mount bootable operating system ISO installer',
        icon: Disc,
        iconColor: 'text-emerald-400',
        badge: 'Storage',
        action: { type: 'open_storage', mode: 'cdrom' },
      },
      {
        id: 'action-network',
        category: 'Capabilities',
        title: 'Add Network Interface (vNIC)',
        subtitle: 'Connect to NAT virtual network or host bridge interface',
        icon: Network,
        iconColor: 'text-sky-400',
        badge: 'Network',
        action: { type: 'open_network' },
      },
      {
        id: 'action-pci',
        category: 'Capabilities',
        title: 'Attach Host PCI Device',
        subtitle: 'Pass through physical GPU, NIC, or accelerator via VFIO',
        icon: Zap,
        iconColor: 'text-amber-400',
        badge: 'Passthrough',
        action: { type: 'open_pci' },
      },
      {
        id: 'action-compute',
        category: 'Capabilities',
        title: 'Configure Compute Sizing',
        subtitle: 'Modify vCPU core allocation, socket topology, and RAM',
        icon: Cpu,
        iconColor: 'text-purple-400',
        badge: 'Compute',
        action: { type: 'open_compute' },
      },
    ];

    // Discovered Storage Volumes
    pools.forEach((pool) => {
      pool.volumes.forEach((vol) => {
        const isIso = vol.format === 'iso' || vol.name.endsWith('.iso');
        list.push({
          id: `vol-${pool.name}-${vol.name}`,
          category: 'Discovered Storage Volumes',
          title: vol.name,
          subtitle: `${pool.name} • ${vol.path} • ${formatBytes(vol.capacityBytes)}`,
          icon: isIso ? Disc : Database,
          iconColor: 'text-emerald-400',
          badge: vol.format.toUpperCase(),
          action: {
            type: 'open_storage',
            mode: isIso ? 'cdrom' : 'disk',
            initialPath: vol.path,
          },
        });
      });
    });

    // Discovered Networks
    networks.forEach((net) => {
      list.push({
        id: `net-${net.name}`,
        category: 'Discovered Host Networks',
        title: `${net.name} (${net.forwardMode.toUpperCase()})`,
        subtitle: `Bridge: ${net.bridgeName || 'virbr0'} • ${net.ipAddress || 'DHCP'} • ${net.active ? 'Active' : 'Inactive'}`,
        icon: Network,
        iconColor: 'text-sky-400',
        badge: net.forwardMode.toUpperCase(),
        action: {
          type: 'open_network',
          initialNetwork: net.name,
        },
      });
    });

    // Discovered PCI Devices
    pciDevices.forEach((dev) => {
      list.push({
        id: `pci-${dev.name}`,
        category: 'Discovered Host PCI Hardware',
        title: `${dev.vendorName} ${dev.productName}`,
        subtitle: `PCI ${dev.domain}:${dev.bus}:${dev.slot}.${dev.function} • IOMMU Group ${dev.iommuGroup}`,
        icon: Zap,
        iconColor: 'text-amber-400',
        badge: 'IOMMU ' + dev.iommuGroup,
        action: {
          type: 'open_pci',
          initialDeviceName: dev.name,
        },
      });
    });

    return list;
  }, [pools, networks, pciDevices]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group filtered items by category
  const groupedItems = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    filteredItems.forEach((item) => {
      const arr = map.get(item.category) || [];
      arr.push(item);
      map.set(item.category, arr);
    });
    return map;
  }, [filteredItems]);

  // Flattened array for keyboard index mapping
  const flatItems = useMemo(() => {
    const res: PaletteItem[] = [];
    groupedItems.forEach((items) => {
      res.push(...items);
    });
    return res;
  }, [groupedItems]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % Math.max(1, flatItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          onSelectAction(flatItems[selectedIndex].action);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, selectedIndex, onSelectAction, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#101118] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3 bg-neutral-950/70">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a hardware capability or search discovered host devices..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
          />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-neutral-400 font-mono">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto flex-1 p-2 space-y-4">
          {flatItems.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No matching hardware devices or actions found.
            </div>
          ) : (
            Array.from(groupedItems.entries()).map(([category, catItems]) => (
              <div key={category} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {category}
                </div>
                {catItems.map((item) => {
                  const itemIndex = flatItems.findIndex((fi) => fi.id === item.id);
                  const isSelected = itemIndex === selectedIndex;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectAction(item.action);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                          : 'hover:bg-white/5 border border-transparent text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg bg-neutral-950/80 border border-white/10 shrink-0 ${item.iconColor}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate flex items-center gap-2">
                            <span>{item.title}</span>
                            {item.badge && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 border border-white/10 font-mono text-neutral-400">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-2 shrink-0">
                        {isSelected && (
                          <span className="text-[11px] text-indigo-400 font-mono flex items-center gap-1">
                            <span>Configure</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-neutral-600" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Palette Footer Instructions */}
        <div className="px-4 py-2 border-t border-white/5 bg-neutral-950/60 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select & Configure</span>
            <span>ESC Close</span>
          </div>
          <span>Rhino Search-to-Capability</span>
        </div>
      </div>
    </div>
  );
};
