import { ModelCategory, ModelProvider } from '@genfeedai/enums';
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
    it('should return violet classes for IMAGE category', () => {
      const model = new Model({ category: ModelCategory.IMAGE } as never);
      expect(model.categoryBadgeClass).toContain('violet');
    });

    it('should return blue classes for VIDEO category', () => {
      const model = new Model({ category: ModelCategory.VIDEO } as never);
      expect(model.categoryBadgeClass).toContain('blue');
    });

    it('should return amber classes for MUSIC category', () => {
      const model = new Model({ category: ModelCategory.MUSIC } as never);
      expect(model.categoryBadgeClass).toContain('amber');
    });

    it('should return slate classes for unknown category', () => {
      const model = new Model({ category: 'UNKNOWN' } as never);
      expect(model.categoryBadgeClass).toContain('slate');
    });

    it('should return slate classes when category is undefined', () => {
      const model = new Model({} as never);
      expect(model.categoryBadgeClass).toContain('slate');
    });
  });

  describe('providerBadgeClass', () => {
    it('should return slate classes for REPLICATE provider', () => {
      const model = new Model({
        provider: ModelProvider.REPLICATE,
      } as never);
      expect(model.providerBadgeClass).toContain('slate');
    });

    it('should return emerald classes for FAL provider', () => {
      const model = new Model({ provider: ModelProvider.FAL } as never);
      expect(model.providerBadgeClass).toContain('emerald');
    });

    it('should return slate classes for unknown provider', () => {
      const model = new Model({ provider: 'UNKNOWN' } as never);
      expect(model.providerBadgeClass).toContain('slate');
    });

    it('should return slate classes when provider is undefined', () => {
      const model = new Model({} as never);
      expect(model.providerBadgeClass).toContain('slate');
    });
  });
});
