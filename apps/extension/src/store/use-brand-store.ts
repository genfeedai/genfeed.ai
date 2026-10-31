import { create } from 'zustand';

import type { BrandListItem, BrandVoice } from '~models/brand-voice.model';

interface BrandState {
  brands: BrandListItem[];
  activeBrandId: string | null;
  brandVoice: BrandVoice | null;
}

interface BrandActions {
  setBrands: (brands: BrandListItem[]) => void;
  setActiveBrand: (id: string | null) => void;
  setBrandVoice: (voice: BrandVoice | null) => void;
}

export const useBrandStore = create<BrandState & BrandActions>((set) => ({
  activeBrandId: null,
  brands: [],
  brandVoice: null,
  setActiveBrand: (id) => set({ activeBrandId: id }),
  setBrands: (brands) => set({ brands }),
  setBrandVoice: (voice) => set({ brandVoice: voice }),
}));
