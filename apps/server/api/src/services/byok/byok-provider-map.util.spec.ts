import {
  modelKeyToByokProvider,
  modelProviderToByokProvider,
  resolveModelByokProvider,
} from '@api/services/byok/byok-provider-map.util';
import { ByokProvider, ModelProvider } from '@genfeedai/contracts';

describe('byok-provider-map.util', () => {
  describe('modelProviderToByokProvider', () => {
    it('should map OPENROUTER to OPENROUTER', () => {
      expect(modelProviderToByokProvider(ModelProvider.OPENROUTER)).toBe(
        ByokProvider.OPENROUTER,
      );
    });

    // #5294 GENFEED_AI dispatches through Genfeed's own hosted fleet, never
    // through a caller-supplied key — mapping it to REPLICATE let an org's
    // own Replicate BYOK key bypass credits for generation Genfeed still paid
    // to run.
  });

  describe('modelKeyToByokProvider', () => {
    it('should map x-ai/ prefix to OPENROUTER', () => {
      expect(modelKeyToByokProvider('x-ai/grok-4')).toBe(
        ByokProvider.OPENROUTER,
      );
    });

    // #5294 see the GENFEED_AI note above.
  });

  describe('resolveModelByokProvider', () => {
    it.each([
      ['higgsfield-ai/soul/v2/standard', ByokProvider.HIGGSFIELD],
      ['higgsfield-ai/dop/turbo', ByokProvider.HIGGSFIELD],
    ])(
      'prefers the model-key provider for %s over a Replicate catalog fallback',
      (modelKey, expectedProvider) => {
        expect(
          resolveModelByokProvider(modelKey, ModelProvider.REPLICATE),
        ).toBe(expectedProvider);
      },
    );

    // #5294 GENFEED_AI hosted models dispatch through Genfeed's own fleet;
    // no BYOK key should ever bypass credits for them.
  });
});
