import { useState, useEffect, useCallback } from 'react';
import { hostClient } from '@/lib/connect';
import type { HostInfo, StoragePool, VirtualNetwork, HostNodeDevice } from '@/gen/rhino/v1/host_pb';

export function useHost() {
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [networks, setNetworks] = useState<VirtualNetwork[]>([]);
  const [pciDevices, setPciDevices] = useState<HostNodeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHostData = useCallback(async () => {
    try {
      setLoading(true);
      const [infoRes, poolsRes, netRes, pciRes] = await Promise.all([
        hostClient.getHostInfo({}),
        hostClient.listStoragePools({}),
        hostClient.listNetworks({}),
        hostClient.listNodeDevices({ capabilityFilter: 'pci' }),
      ]);
      setHostInfo(infoRes.hostInfo ?? null);
      setPools(poolsRes.pools);
      setNetworks(netRes.networks);
      setPciDevices(pciRes.devices);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHostData();
  }, [fetchHostData]);

  return { hostInfo, pools, networks, pciDevices, loading, error, refetch: fetchHostData };
}
