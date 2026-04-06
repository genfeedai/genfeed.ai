import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { type ReactElement, useEffect } from 'react';

import { useBrandVoice } from '~hooks/use-brand-voice';
import { useBrandStore } from '~store/use-brand-store';

export function BrandSelector(): ReactElement {
  const brands = useBrandStore((s) => s.brands);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const setActiveBrand = useBrandStore((s) => s.setActiveBrand);
  const { fetchBrands } = useBrandVoice();

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  function handleChange(value: string) {
    setActiveBrand(value || null);
  }

  if (brands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No brands found. Create a brand in Genfeed Studio.
      </p>
    );
  }

  return (
    <Select value={activeBrandId ?? ''} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
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
