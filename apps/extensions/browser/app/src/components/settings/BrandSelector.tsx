import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { type ReactElement, useEffect } from 'react';

import { useBrandVoice } from '~hooks/use-brand-voice';
import { useChatStore } from '~store/use-chat-store';
import { useBrandStore } from '~store/use-brand-store';

export function BrandSelector(): ReactElement {
  const brands = useBrandStore((s) => s.brands);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const setActiveBrand = useBrandStore((s) => s.setActiveBrand);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const { fetchBrands } = useBrandVoice();

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  function handleChange(value: string) {
    if (value !== activeBrandId) {
      useChatStore.getState().clearMessages();
      useChatStore.getState().setActiveThread(null);
    }
    setActiveBrand(value || null);
    void chrome.runtime
      .sendMessage({ event: 'captureSetBrand', brandId: value })
      .catch(() => undefined);
  }

  if (brands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No brands found. Create a brand in Genfeed Studio.
      </p>
    );
  }

  return (
    <Select
      disabled={isGenerating}
      value={activeBrandId ?? ''}
      onValueChange={handleChange}
    >
      <SelectTrigger
        aria-label="Active brand"
        className="h-8 w-full border-0 bg-transparent text-xs shadow-none"
      >
        <SelectValue placeholder="Select a brand..." />
      </SelectTrigger>
      <SelectContent>
        {brands.map((brand) => (
          <SelectItem key={brand.id} value={brand.id}>
            {brand.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
