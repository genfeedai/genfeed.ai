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

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    setActiveBrand(id);
  }

  if (brands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No brands found. Create a brand in Genfeed Studio.
      </p>
    );
  }

  return (
    <select
      value={activeBrandId ?? ''}
      onChange={handleChange}
      className="w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
    >
      <option value="">Select a brand...</option>
      {brands.map((brand) => (
        <option key={brand.id} value={brand.id}>
          {brand.label}
        </option>
      ))}
    </select>
  );
}
