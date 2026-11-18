import type { IChannelTarget } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

type LoadDeliveries = (signal: AbortSignal) => Promise<IChannelTarget[]>;

const NO_TARGETS: IChannelTarget[] = [];

/**
 * Delivery targets of one Article or Newsletter, cached per source.
 * `reload` refetches after a new delivery is queued so its state and live link
 * appear; a newer load aborts the one in flight.
 */
export function useSourceDeliveries(
  sourceKey: string,
  load: LoadDeliveries | null,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['source-deliveries', sourceKey], [sourceKey]);
  const { data, refetch } = useQuery<IChannelTarget[]>({
    enabled: load !== null,
    queryFn: async ({ signal }) => {
      if (!load) {
        return NO_TARGETS;
      }
      try {
        return await load(signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load deliveries', error);
        }
        throw error;
      }
    },
    queryKey,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const reload = useCallback(async () => {
    if (!load) {
      return;
    }
    // A load still in flight predates the delivery, so it must not answer.
    await queryClient.cancelQueries({ queryKey });
    await refetch();
  }, [load, queryClient, queryKey, refetch]);

  return { reload, targets: data ?? NO_TARGETS };
}
