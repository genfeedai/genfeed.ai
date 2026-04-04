import type { IModel } from '@genfeedai/interfaces';
import { usePromptBarPricing } from '@hooks/prompt-bar/use-prompt-bar-pricing/use-prompt-bar-pricing';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const createMockModel = (overrides: Partial<IModel> = {}): IModel =>
  ({
    cost: 10,
    id: 'model-1',
    name: 'Test Model',
    pricingType: 'flat',
    provider: 'test',
    ...overrides,
  }) as IModel;

describe('usePromptBarPricing', () => {
  describe('Flat Pricing', () => {
    it('returns flat cost for single model', () => {
      const model = createMockModel({ cost: 15, pricingType: 'flat' });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(15);
    });

    it('sums costs for multiple flat-priced models', () => {
      const models = [
        createMockModel({ cost: 10, pricingType: 'flat' }),
        createMockModel({ cost: 20, id: 'model-2', pricingType: 'flat' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: models,
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(30);
    });

    it('multiplies cost by number of outputs', () => {
      const model = createMockModel({ cost: 10, pricingType: 'flat' });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 3,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(30);
    });

    it('defaults to flat pricing when pricingType is undefined', () => {
      const model = createMockModel({ cost: 25, pricingType: undefined });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(25);
    });
  });

  describe('Per-Megapixel Pricing', () => {
    it('calculates cost based on resolution', () => {
      const model = createMockModel({
        cost: 10, // Fallback cost
        costPerUnit: 5, // 5 credits per megapixel
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1000, // 1 megapixel
          watchedOutputs: 1,
          watchedWidth: 1000,
        }),
      );

      expect(result.current.selectedModelCost).toBe(5);
    });

    it('uses 1080x1920 as default dimensions', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 5,
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: undefined,
          watchedOutputs: 1,
          watchedWidth: undefined,
        }),
      );

      // 1080 * 1920 = 2,073,600 pixels = 2.0736 megapixels
      // 2.0736 * 5 = 10.368, ceil = 11
      expect(result.current.selectedModelCost).toBe(11);
    });

    it('respects minCost for per-megapixel pricing', () => {
      const model = createMockModel({
        cost: 5,
        costPerUnit: 1, // Very low cost
        minCost: 10, // Minimum cost
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 100, // 0.01 megapixels = 0.01 credits, but minCost is 10
          watchedOutputs: 1,
          watchedWidth: 100,
        }),
      );

      expect(result.current.selectedModelCost).toBe(10);
    });

    it('falls back to model cost when width is 0', () => {
      const model = createMockModel({
        cost: 15,
        costPerUnit: 5,
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 0, // 0 causes fallback to model.cost
        }),
      );

      // When width is 0, falls back to model.cost (15)
      expect(result.current.selectedModelCost).toBe(15);
    });
  });

  describe('Per-Second Pricing', () => {
    it('calculates cost based on duration', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 2, // 2 credits per second
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 10, // 10 seconds
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(20);
    });

    it('uses 8 seconds as default duration', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 3,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: undefined,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // 8 seconds * 3 credits = 24
      expect(result.current.selectedModelCost).toBe(24);
    });

    it('respects minCost for per-second pricing', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 1,
        minCost: 15,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 5, // 5 * 1 = 5, but minCost is 15
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(15);
    });

    it('falls back to model cost when duration is 0', () => {
      const model = createMockModel({
        cost: 12,
        costPerUnit: 2,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 0, // 0 causes fallback to model.cost
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // When duration is 0, falls back to model.cost (12)
      expect(result.current.selectedModelCost).toBe(12);
    });
  });

  describe('calculateModelCost function', () => {
    it('exposes calculateModelCost function', () => {
      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(typeof result.current.calculateModelCost).toBe('function');
    });

    it('calculateModelCost works for flat pricing', () => {
      const model = createMockModel({ cost: 25, pricingType: 'flat' });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      const cost = result.current.calculateModelCost(model, 1080, 1920, 8);
      expect(cost).toBe(25);
    });

    it('calculateModelCost works for per-megapixel pricing', () => {
      const model = createMockModel({
        costPerUnit: 10,
        minCost: 5,
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // 1000x1000 = 1 megapixel * 10 = 10
      const cost = result.current.calculateModelCost(model, 1000, 1000, 8);
      expect(cost).toBe(10);
    });

    it('calculateModelCost works for per-second pricing', () => {
      const model = createMockModel({
        costPerUnit: 5,
        minCost: 10,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // 10 seconds * 5 = 50
      const cost = result.current.calculateModelCost(model, 1080, 1920, 10);
      expect(cost).toBe(50);
    });
  });

  describe('Empty State', () => {
    it('returns 0 when no models are selected', () => {
      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(0);
    });
  });

  describe('Mixed Pricing Models', () => {
    it('handles mix of pricing types correctly', () => {
      const models = [
        createMockModel({ cost: 10, id: 'flat', pricingType: 'flat' }),
        createMockModel({
          costPerUnit: 5,
          id: 'megapixel',
          pricingType: 'per-megapixel',
        }),
        createMockModel({
          costPerUnit: 2,
          id: 'second',
          pricingType: 'per-second',
        }),
      ];

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: models,
          watchedDuration: 5, // 5 seconds
          watchedHeight: 1000, // 1 megapixel
          watchedOutputs: 1,
          watchedWidth: 1000,
        }),
      );

      // Flat: 10
      // Per-megapixel: 1 * 5 = 5
      // Per-second: 5 * 2 = 10
      // Total: 25
      expect(result.current.selectedModelCost).toBe(25);
    });
  });
});
