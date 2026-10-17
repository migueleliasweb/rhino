import { useEffect, useState, useRef } from 'react';
import { vmClient } from '@/lib/connect';
import type { TelemetryUpdate } from '@/gen/rhino/v1/vm_pb';

export interface TelemetryDataPoint {
  timestamp: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskReadBytesSec: number;
  diskWriteBytesSec: number;
  netRxBytesSec: number;
  netTxBytesSec: number;
}

export function useTelemetry(domainId: string | null, intervalMs = 1000, enabled = true) {
  const [telemetry, setTelemetry] = useState<TelemetryUpdate | null>(null);
  const [history, setHistory] = useState<TelemetryDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const historyRef = useRef<TelemetryDataPoint[]>([]);

  useEffect(() => {
    if (!domainId || !enabled) {
      setTelemetry(null);
      setIsConnected(false);
      return;
    }

    const abortController = new AbortController();
    let isCancelled = false;

    async function startStream() {
      try {
        setIsConnected(true);
        setError(null);
        
        const stream = vmClient.streamTelemetry(
          { id: domainId!, intervalMs },
          { signal: abortController.signal }
        );

        for await (const res of stream) {
          if (isCancelled) break;
          if (res.update) {
            setTelemetry(res.update);

            const point: TelemetryDataPoint = {
              timestamp: Number(res.update.timestampEpochMs) || Date.now(),
              cpuPercent: res.update.cpuPercent,
              memoryUsedBytes: Number(res.update.memoryUsedBytes),
              memoryTotalBytes: Number(res.update.memoryTotalBytes),
              diskReadBytesSec: Number(res.update.diskReadBytesSec),
              diskWriteBytesSec: Number(res.update.diskWriteBytesSec),
              netRxBytesSec: Number(res.update.netRxBytesSec),
              netTxBytesSec: Number(res.update.netTxBytesSec),
            };

            const updatedHistory = [...historyRef.current, point].slice(-30);
            historyRef.current = updatedHistory;
            setHistory(updatedHistory);
          }
        }
      } catch (err: unknown) {
        if (!isCancelled && !abortController.signal.aborted) {
          console.warn('[Telemetry] Stream ended or encountered error:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsConnected(false);
        }
      }
    }

    startStream();

    return () => {
      isCancelled = true;
      abortController.abort();
      setIsConnected(false);
    };
  }, [domainId, intervalMs, enabled]);

  return { telemetry, history, isConnected, error };
}
