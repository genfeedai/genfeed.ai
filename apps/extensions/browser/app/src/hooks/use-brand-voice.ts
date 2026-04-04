import { useCallback, useEffect } from 'react';

import type { BrandListItem, BrandVoice } from '~models/brand-voice.model';
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
        setBrands(response.brands as BrandListItem[]);
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

    chrome.runtime.sendMessage(
      { event: 'getBrandVoice', payload: { brandId: activeBrandId } },
      (response) => {
        if (response?.success && response.brandVoice) {
          setBrandVoice(response.brandVoice as BrandVoice);
        } else {
          setBrandVoice(null);
        }
      },
    );
  }, [activeBrandId, setBrandVoice]);

  return { fetchBrands };
}
