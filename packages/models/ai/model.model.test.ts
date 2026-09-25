import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Model: class BaseModel {
    public category?: string;
    public provider?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Model } from '@models/ai/model.model';

describe('Model', () => {
  describe('categoryBadgeClass', () => {
    it('should return info classes for IMAGE category', () => {
      const model = new Model({ category: ModelCategory.IMAGE } as never);
      expect(model.categoryBadgeClass).toContain('info');
    });

    it('should return violet classes for VIDEO category', () => {
      const model = new Model({ category: ModelCategory.VIDEO } as never);
      expect(model.categoryBadgeClass).toContain('violet');
    });

    it('should return warning classes for MUSIC category', () => {
      const model = new Model({ category: ModelCategory.MUSIC } as never);
      expect(model.categoryBadgeClass).toContain('warning');
    });

    it('should return muted classes for unknown category', () => {
      const model = new Model({ category: 'UNKNOWN' } as never);
      expect(model.categoryBadgeClass).toContain('muted');
    });

    it('should return muted classes when category is undefined', () => {
      const model = new Model({} as never);
      expect(model.categoryBadgeClass).toContain('muted');
    });
  });

  describe('providerBadgeClass', () => {
    it('should return Replicate amber for REPLICATE provider', () => {
      const model = new Model({
        provider: ModelProvider.REPLICATE,
      } as never);
      expect(model.providerBadgeClass).toContain('#D97706');
    });

    it('should return fal cyan for FAL provider', () => {
      const model = new Model({ provider: ModelProvider.FAL } as never);
      expect(model.providerBadgeClass).toContain('#06B6D4');
    });

    it('should return OpenRouter violet for OPENROUTER provider', () => {
      const model = new Model({ provider: ModelProvider.OPENROUTER } as never);
      expect(model.providerBadgeClass).toContain('#8B5CF6');
    });

    it('should return muted classes for unknown provider', () => {
      const model = new Model({ provider: 'UNKNOWN' } as never);
      expect(model.providerBadgeClass).toContain('muted');
    });

    it('should return muted classes when provider is undefined', () => {
      const model = new Model({} as never);
      expect(model.providerBadgeClass).toContain('muted');
    });
  });
});
