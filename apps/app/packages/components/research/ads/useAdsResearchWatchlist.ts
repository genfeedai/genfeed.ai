'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  AdWatchedAdvertiser,
  AdWatchlistPlatform,
  AdWatchlistPlatformReadiness,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdWatchedAdvertisersService } from '@services/ads/ad-watched-advertisers.service';
import { AdsResearchService } from '@services/ads/ads-research.service';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export type AdsResearchWatchlistApi = {
  addError?: string;
  advertisers: AdWatchedAdvertiser[];
  busyId?: string;
  isAdding: boolean;
  isLoading: boolean;
  loadError?: string;
  readiness: AdWatchlistPlatformReadiness[];
  addAdvertiser: (input: {
    advertiserHandle: string;
    platform: AdWatchlistPlatform;
  }) => Promise<void>;
  removeAdvertiser: (id: string) => Promise<void>;
};

/**
 * Reads and edits the competitor watchlist that paid-creative ingestion polls.
 * It lives beside the Ads page rather than inside `useAdsResearchPageClient` so
 * the research query surface stays one concern and the watchlist can be
 * rendered — or dropped — without touching it.
 */
export function useAdsResearchWatchlist(): AdsResearchWatchlistApi {
  const { brandId, isReady } = useBrand();
  const getWatchlistService = useAuthedService((token: string) =>
    AdWatchedAdvertisersService.getInstance(token),
  );
  const getAdsResearchService = useAuthedService((token: string) =>
    AdsResearchService.getInstance(token),
  );
  const [addError, setAddError] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);

  const {
    data: advertisers = [],
    error: loadError,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isReady,
    queryFn: async () => {
      const service = await getWatchlistService();
      return await service.list({ brandId: brandId || undefined });
    },
    queryKey: ['ads-research-watchlist', brandId, isReady],
  });

  // Readiness is a deployment fact, not a brand one: which archives this
  // install can reach at all. It is fetched here so the panel can explain an
  // empty watchlist row without the page wiring a second hook for it.
  const { data: readiness = [] } = useQuery({
    queryFn: async () => {
      const service = await getAdsResearchService();
      return await service.listWatchlistReadiness();
    },
    queryKey: ['ads-research-watchlist-readiness'],
  });

  async function addAdvertiser(input: {
    advertiserHandle: string;
    platform: AdWatchlistPlatform;
  }): Promise<void> {
    const advertiserHandle = input.advertiserHandle.trim().replace(/^@/, '');
    if (!advertiserHandle) {
      setAddError('Enter the advertiser handle or page name to watch.');
      return;
    }

    setAddError(undefined);
    setIsAdding(true);
    try {
      const service = await getWatchlistService();
      await service.create({
        advertiserHandle,
        ...(brandId ? { brandId } : {}),
        platform: input.platform,
      });
      await refetch();
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : 'Could not add that advertiser.',
      );
    } finally {
      setIsAdding(false);
    }
  }

  async function removeAdvertiser(id: string): Promise<void> {
    setAddError(undefined);
    setBusyId(id);
    try {
      const service = await getWatchlistService();
      await service.remove(id);
      await refetch();
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : 'Could not remove that advertiser.',
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return {
    addAdvertiser,
    addError,
    advertisers,
    busyId,
    isAdding,
    isLoading,
    ...(loadError instanceof Error ? { loadError: loadError.message } : {}),
    readiness,
    removeAdvertiser,
  };
}
