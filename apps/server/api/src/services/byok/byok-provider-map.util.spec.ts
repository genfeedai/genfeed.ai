import {
  modelKeyToByokProvider,
  modelProviderToByokProvider,
} from '@api/services/byok/byok-provider-map.util';
import { ByokProvider, ModelProvider } from '@genfeedai/enums';

describe('byok-provider-map.util', () => {
  describe('modelProviderToByokProvider', () => {
    it('should map REPLICATE to REPLICATE', () => {
      expect(modelProviderToByokProvider(ModelProvider.REPLICATE)).toBe(
        ByokProvider.REPLICATE,
      );
    });

    it('should map FAL to FAL', () => {
      expect(modelProviderToByokProvider(ModelProvider.FAL)).toBe(
        ByokProvider.FAL,
      );
    });

    it('should return undefined for unknown provider', () => {
      expect(modelProviderToByokProvider('unknown' as any)).toBeUndefined();
    });
  });

  describe('modelKeyToByokProvider', () => {
    it('should map heygen/ prefix to HEYGEN', () => {
      expect(modelKeyToByokProvider('heygen/avatar')).toBe(ByokProvider.HEYGEN);
    });

    it('should map fal-ai/ prefix to FAL', () => {
      expect(modelKeyToByokProvider('fal-ai/flux')).toBe(ByokProvider.FAL);
    });

    it('should map x-ai/ prefix to OPENROUTER', () => {
      expect(modelKeyToByokProvider('x-ai/grok-4')).toBe(
        ByokProvider.OPENROUTER,
      );
    });

    it('should return undefined for unknown prefix', () => {
      expect(modelKeyToByokProvider('unknown/model')).toBeUndefined();
    });
  });
});
