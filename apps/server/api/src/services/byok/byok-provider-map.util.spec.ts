import {
  modelKeyToByokProvider,
  modelProviderToByokProvider,
  resolveModelByokProvider,
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

    it('should map OPENROUTER to OPENROUTER', () => {
      expect(modelProviderToByokProvider(ModelProvider.OPENROUTER)).toBe(
        ByokProvider.OPENROUTER,
      );
    });

    it('should return undefined for unknown provider', () => {
      expect(modelProviderToByokProvider('unknown')).toBeUndefined();
    });
  });

  describe('modelKeyToByokProvider', () => {
    it('should map argil/ prefix to ARGIL', () => {
      expect(modelKeyToByokProvider('argil/atom')).toBe(ByokProvider.ARGIL);
    });

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

  describe('resolveModelByokProvider', () => {
    it.each([
      ['higgsfield-ai/soul/standard', ByokProvider.HIGGSFIELD],
      ['kling-video/v3/pro/image-to-video', ByokProvider.HIGGSFIELD],
    ])(
      'prefers the model-key provider for %s over a Replicate catalog fallback',
      (modelKey, expectedProvider) => {
        expect(
          resolveModelByokProvider(modelKey, ModelProvider.REPLICATE),
        ).toBe(expectedProvider);
      },
    );

    it('falls back to the catalog provider when the model key has no provider prefix', () => {
      expect(
        resolveModelByokProvider('vendor/unknown', ModelProvider.REPLICATE),
      ).toBe(ByokProvider.REPLICATE);
    });

    it('preserves catalog precedence for OpenRouter-proxied provider keys', () => {
      expect(
        resolveModelByokProvider(
          'anthropic/claude-4.5-sonnet',
          ModelProvider.OPENROUTER,
        ),
      ).toBe(ByokProvider.OPENROUTER);
    });
  });
});
