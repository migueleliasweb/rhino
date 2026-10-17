import { useState, useEffect, useCallback } from 'react';
import { vmClient } from '@/lib/connect';
import type { DomainSummary, DomainDetail } from '@/gen/rhino/v1/vm_pb';

export function useDomains() {
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      setLoading(true);
      const res = await vmClient.listDomains({ includeInactive: true });
      setDomains(res.domains);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
    // Refresh periodically
    const timer = setInterval(fetchDomains, 5000);
    return () => clearInterval(timer);
  }, [fetchDomains]);

  return { domains, loading, error, refetch: fetchDomains };
}

export function useDomainDetail(domainId: string | null) {
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDomain = useCallback(async () => {
    if (!domainId) {
      setDomain(null);
      return;
    }
    try {
      setLoading(true);
      const res = await vmClient.getDomain({ id: domainId });
      setDomain(res.domain ?? null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => {
    fetchDomain();
  }, [fetchDomain]);

  const startDomain = useCallback(async () => {
    if (!domainId) return;
    await vmClient.startDomain({ id: domainId });
    await fetchDomain();
  }, [domainId, fetchDomain]);

  const stopDomain = useCallback(async (force = false) => {
    if (!domainId) return;
    await vmClient.stopDomain({ id: domainId, force });
    await fetchDomain();
  }, [domainId, fetchDomain]);

  const restartDomain = useCallback(async (force = false) => {
    if (!domainId) return;
    await vmClient.restartDomain({ id: domainId, force });
    await fetchDomain();
  }, [domainId, fetchDomain]);

  return {
    domain,
    loading,
    error,
    refetch: fetchDomain,
    startDomain,
    stopDomain,
    restartDomain,
  };
}
