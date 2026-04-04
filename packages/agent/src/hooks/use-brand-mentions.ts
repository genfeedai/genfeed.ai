import type { BrandMentionItem } from '@genfeedai/agent/types/mention.types';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useMemo } from 'react';

interface UseBrandMentionsReturn {
  mentions: BrandMentionItem[];
  isLoading: boolean;
}

export function useBrandMentions(): UseBrandMentionsReturn {
  const { brands, isReady } = useBrand();

  const mentions = useMemo<BrandMentionItem[]>(
    () =>
      brands.map((brand) => ({
        brandName: brand.label,
        brandSlug: brand.slug,
        id: brand.id,
      })),
    [brands],
  );

  return { isLoading: !isReady, mentions };
}
