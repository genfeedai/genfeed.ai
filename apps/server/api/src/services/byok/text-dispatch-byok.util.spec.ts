import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import {
  resolveTextDispatchByokProvider,
  textDispatchApiKey,
} from '@api/services/byok/text-dispatch-byok.util';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConflictException } from '@nestjs/common';

const NATIVE_REPLICATE_TEXT_MODEL = 'mistralai/mixtral-8x7b-instruct-v0.1';

describe('text-dispatch-byok.util', () => {
  describe('resolveTextDispatchByokProvider', () => {
    it('keys every other text model to the Replicate prediction key', () => {
      expect(isOpenRouterTextModel(NATIVE_REPLICATE_TEXT_MODEL)).toBe(false);
      expect(resolveTextDispatchByokProvider(NATIVE_REPLICATE_TEXT_MODEL)).toBe(
        ByokProvider.REPLICATE,
      );
    });

    it('follows dispatch routing, not the model-key vendor prefix', () => {
      const model = 'anthropic/claude-sonnet-5';
      // The catalog map would pick a direct Anthropic key, but
      // generateTextCompletionSync completes anthropic/* through OpenRouter.
      expect(resolveModelByokProvider(model)).toBe(ByokProvider.ANTHROPIC);
      expect(resolveTextDispatchByokProvider(model)).toBe(
        ByokProvider.OPENROUTER,
      );
    });
  });

  describe('textDispatchApiKey', () => {
    const model = MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH;

    it('fails closed instead of dispatching a bypassed request on the platform key', () => {
      expect(() =>
        textDispatchApiKey(
          { keys: { [ByokProvider.OPENROUTER]: 'org-openrouter-key' } },
          NATIVE_REPLICATE_TEXT_MODEL,
        ),
      ).toThrow(ConflictException);
    });
  });
});
