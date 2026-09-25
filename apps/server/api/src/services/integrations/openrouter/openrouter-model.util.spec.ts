import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { LLM_DEFAULTS, MODEL_KEYS } from '@genfeedai/contracts/constants';

describe('isOpenRouterTextModel', () => {
  it('matches product text defaults', () => {
    expect(DEFAULT_TEXT_MODEL).toBe(LLM_DEFAULTS.planning);
    expect(DEFAULT_MINI_TEXT_MODEL).toBe(LLM_DEFAULTS.grokFast);
    expect(isOpenRouterTextModel(DEFAULT_TEXT_MODEL)).toBe(true);
    expect(isOpenRouterTextModel(DEFAULT_MINI_TEXT_MODEL)).toBe(true);
  });

  it('matches known OpenRouter Grok keys', () => {
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4_FAST)).toBe(
      true,
    );
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4)).toBe(true);
    expect(isOpenRouterTextModel(MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST)).toBe(
      true,
    );
  });

  it('routes former Replicate text keys through OpenRouter', () => {
    expect(
      isOpenRouterTextModel(MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH),
    ).toBe(true);
    expect(
      isOpenRouterTextModel(MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET),
    ).toBe(true);
    expect(isOpenRouterTextModel(MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2)).toBe(
      true,
    );
  });

  it('rejects image, video, and unknown Replicate prediction ids', () => {
    expect(isOpenRouterTextModel('owner/llm')).toBe(false);
    expect(isOpenRouterTextModel(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4)).toBe(
      false,
    );
    expect(isOpenRouterTextModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
      false,
    );
    expect(
      isOpenRouterTextModel(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5),
    ).toBe(false);
  });
});
