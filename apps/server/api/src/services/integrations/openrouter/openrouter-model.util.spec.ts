import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

describe('isOpenRouterTextModel', () => {
  it('matches known OpenRouter Grok keys', () => {
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4_FAST)).toBe(
      true,
    );
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4)).toBe(true);
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST)).toBe(
      true,
    );
  });

  it('matches other x-ai OpenRouter slugs', () => {
    expect(isOpenRouterTextModel('x-ai/grok-4-fast')).toBe(true);
  });

  it('rejects Replicate text models', () => {
    expect(
      isOpenRouterTextModel(MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH),
    ).toBe(false);
    expect(isOpenRouterTextModel('owner/llm')).toBe(false);
  });
});
