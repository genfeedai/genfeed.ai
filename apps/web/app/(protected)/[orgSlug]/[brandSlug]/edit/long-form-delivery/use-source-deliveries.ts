import type { IChannelTarget } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

type LoadDeliveries = (signal: AbortSignal) => Promise<IChannelTarget[]>;

/**
 * Delivery targets of one Article or Newsletter. `reload` refetches after a
 * new delivery is queued so its state and live link appear; a newer load
 * aborts the one in flight.
 */
export function useSourceDeliveries(load: LoadDeliveries | null) {
  const [targets, setTargets] = useState<IChannelTarget[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!load) {
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const next = await load(controller.signal);
      if (!controller.signal.aborted) {
        setTargets(next);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        logger.error('Failed to load deliveries', error);
      }
    }
  }, [load]);

  useEffect(() => {
    void reload();
    return () => controllerRef.current?.abort();
  }, [reload]);

  return { reload, targets };
}
