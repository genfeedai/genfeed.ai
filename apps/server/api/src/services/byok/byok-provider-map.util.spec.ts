import {
  modelKeyToByokProvider,
  modelProviderToByokProvider,
  resolveModelByokProvider,
} from '@api/services/byok/byok-provider-map.util';
import { ByokProvider, ModelProvider } from '@genfeedai/contracts';

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

    // #5294 GENFEED_AI dispatches through Genfeed's own hosted fleet, never
    // through a caller-supplied key — mapping it to REPLICATE let an org's
    // own Replicate BYOK key bypass credits for generation Genfeed still paid
    // to run.
    it('should not map GENFEED_AI to any BYOK provider', () => {
      expect(
        modelProviderToByokProvider(ModelProvider.GENFEED_AI),
      ).toBeUndefined();
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

    // #5294 see the GENFEED_AI note above.
    it('should not map the genfeed-ai/ prefix to any BYOK provider', () => {
      expect(modelKeyToByokProvider('genfeed-ai/some-model')).toBeUndefined();
    });
  });

  describe('resolveModelByokProvider', () => {
    it.each([
      ['higgsfield-ai/soul/v2/standard', ByokProvider.HIGGSFIELD],
      ['higgsfield-ai/dop/turbo', ByokProvider.HIGGSFIELD],
      ['higgsfield/genjutsu/motion-transfer/v1.0', ByokProvider.HIGGSFIELD],
      ['heygen/avatar', ByokProvider.HEYGEN],
      ['heygen/heygen-video-1', ByokProvider.HEYGEN],
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

    // #5294 GENFEED_AI hosted models dispatch through Genfeed's own fleet;
    // no BYOK key should ever bypass credits for them.
    it('never resolves a BYOK provider for GENFEED_AI hosted models', () => {
      expect(
        resolveModelByokProvider(
          'genfeed-ai/some-model',
          ModelProvider.GENFEED_AI,
        ),
      ).toBeUndefined();
    });
  });
});
