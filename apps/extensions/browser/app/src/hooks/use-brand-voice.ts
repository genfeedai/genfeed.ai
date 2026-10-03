import { useCallback, useEffect } from 'react';
import type { BrandListItem, BrandVoice } from '~models/brand-voice.model';
import { getWorkspaceState } from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { logger } from '~utils/logger.util';

interface UseBrandVoiceReturn {
  fetchBrands: () => void;
}

export function useBrandVoice(): UseBrandVoiceReturn {
  const setBrands = useBrandStore((s) => s.setBrands);
  const setBrandVoice = useBrandStore((s) => s.setBrandVoice);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);

  const fetchBrands = useCallback(() => {
    chrome.runtime.sendMessage({ event: 'getBrands' }, (response) => {
      if (response?.success && response.brands) {
        const brands = response.brands as BrandListItem[];
        setBrands(brands);
        const selected = useBrandStore.getState().activeBrandId;
        if (selected && !brands.some((brand) => brand.id === selected))
          useBrandStore.getState().setActiveBrand(null);
      } else {
        logger.error('Failed to fetch brands', response?.error);
      }
    });
  }, [setBrands]);

  useEffect(() => {
    if (!activeBrandId) {
      setBrandVoice(null);
      return;
    }

    const expected = getWorkspaceState();
    let cancelled = false;
    chrome.runtime.sendMessage(
      { event: 'getBrandVoice', payload: { brandId: activeBrandId } },
      (response) => {
        const current = getWorkspaceState();
        if (
          cancelled ||
          expected.status !== 'ready' ||
          current.status !== 'ready' ||
          current.snapshot.revision !== expected.snapshot.revision ||
          current.snapshot.userId !== expected.snapshot.userId ||
          current.snapshot.organizationId !== expected.snapshot.organizationId
        )
          return;
        if (response?.success && response.brandVoice) {
          setBrandVoice(response.brandVoice as BrandVoice);
        } else {
          setBrandVoice(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, setBrandVoice]);

  return { fetchBrands };
}
