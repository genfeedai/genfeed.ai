import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Per-brand interview answer drafts. Survives refresh so a half-typed answer
 * is not lost when the user reloads mid-question.
 */
export type BrandInterviewBrandDraft = {
  answerByFieldKey: Record<string, string>;
  updatedAt: string;
};

type BrandInterviewDraftState = {
  byBrandId: Record<string, BrandInterviewBrandDraft>;
  clearAnswer: (brandId: string, fieldKey: string) => void;
  clearBrand: (brandId: string) => void;
  getAnswer: (brandId: string, fieldKey: string) => string;
  setAnswer: (brandId: string, fieldKey: string, value: string) => void;
};

function emptyBrandDraft(): BrandInterviewBrandDraft {
  return {
    answerByFieldKey: {},
    updatedAt: new Date().toISOString(),
  };
}

export const useBrandInterviewDraftStore = create<BrandInterviewDraftState>()(
  persist(
    (set, get) => ({
      byBrandId: {},

      clearAnswer: (brandId, fieldKey) => {
        set((state) => {
          const existing = state.byBrandId[brandId];
          if (!existing?.answerByFieldKey[fieldKey]) {
            return state;
          }

          const { [fieldKey]: _removed, ...rest } = existing.answerByFieldKey;
          return {
            byBrandId: {
              ...state.byBrandId,
              [brandId]: {
                answerByFieldKey: rest,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      clearBrand: (brandId) => {
        set((state) => {
          if (!state.byBrandId[brandId]) {
            return state;
          }
          const { [brandId]: _removed, ...rest } = state.byBrandId;
          return { byBrandId: rest };
        });
      },

      getAnswer: (brandId, fieldKey) =>
        get().byBrandId[brandId]?.answerByFieldKey[fieldKey] ?? '',

      setAnswer: (brandId, fieldKey, value) => {
        set((state) => {
          const existing = state.byBrandId[brandId] ?? emptyBrandDraft();
          return {
            byBrandId: {
              ...state.byBrandId,
              [brandId]: {
                answerByFieldKey: {
                  ...existing.answerByFieldKey,
                  [fieldKey]: value,
                },
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },
    }),
    {
      name: 'genfeed-brand-interview-drafts-v1',
      partialize: (state) => ({ byBrandId: state.byBrandId }),
    },
  ),
);
