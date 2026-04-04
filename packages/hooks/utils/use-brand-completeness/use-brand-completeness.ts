'use client';

import {
  type BrandCompletenessResult,
  computeBrandCompleteness,
} from '@genfeedai/helpers';
import { useMemo } from 'react';

interface BrandLike {
  id?: string;
  label?: string;
  description?: string;
  text?: string;
  logo?: unknown;
  primaryColor?: string;
  references?: unknown[];
  agentConfig?: {
    voice?: {
      tone?: string;
      style?: string;
      audience?: string[];
      values?: string[];
      sampleOutput?: string;
      messagingPillars?: string[];
      doNotSoundLike?: string[];
    };
    strategy?: {
      contentTypes?: string[];
      platforms?: string[];
      goals?: string[];
      frequency?: string;
    };
    persona?: string;
  };
}

export function useBrandCompleteness(
  brand: BrandLike | null | undefined,
): BrandCompletenessResult | null {
  return useMemo(() => {
    if (!brand) return null;
    return computeBrandCompleteness(brand);
  }, [brand]);
}
