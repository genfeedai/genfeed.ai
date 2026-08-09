import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_LIPSYNC_MODEL,
  DEFAULT_LLM_MODEL,
  DEFAULT_VIDEO_MODEL,
  getImageModelLabel,
  getLipSyncModelLabel,
  getLLMModelLabel,
  getVideoModelLabel,
  IMAGE_MODEL_ID_MAP,
  IMAGE_MODEL_MAP,
  IMAGE_MODELS,
  LIPSYNC_MODELS,
  LLM_MODEL_ID_MAP,
  LLM_MODEL_MAP,
  LLM_MODELS,
  lipSyncModelSupportsImage,
  VIDEO_MODEL_ID_MAP,
  VIDEO_MODEL_MAP,
  VIDEO_MODELS,
} from './registry';

describe('model registry maps', () => {
  it('image maps round-trip between api ids and model values', () => {
    for (const model of IMAGE_MODELS) {
      expect(IMAGE_MODEL_MAP[model.apiId]).toBe(model.value);
      expect(IMAGE_MODEL_ID_MAP[model.value]).toBe(model.apiId);
    }
  });

  it('video maps round-trip between api ids and model values', () => {
    for (const model of VIDEO_MODELS) {
      expect(VIDEO_MODEL_MAP[model.apiId]).toBe(model.value);
      expect(VIDEO_MODEL_ID_MAP[model.value]).toBe(model.apiId);
    }
  });

  it('llm maps round-trip between api ids and model values', () => {
    for (const model of LLM_MODELS) {
      expect(LLM_MODEL_MAP[model.apiId]).toBe(model.value);
      expect(LLM_MODEL_ID_MAP[model.value]).toBe(model.apiId);
    }
  });

  it('defaults are registered models', () => {
    expect(IMAGE_MODELS.some((m) => m.value === DEFAULT_IMAGE_MODEL)).toBe(
      true,
    );
    expect(VIDEO_MODELS.some((m) => m.value === DEFAULT_VIDEO_MODEL)).toBe(
      true,
    );
    expect(LIPSYNC_MODELS.some((m) => m.value === DEFAULT_LIPSYNC_MODEL)).toBe(
      true,
    );
    expect(LLM_MODELS.some((m) => m.value === DEFAULT_LLM_MODEL)).toBe(true);
  });
});

describe('model label lookups', () => {
  it('returns the configured labels', () => {
    expect(getImageModelLabel('nano-banana')).toBe('Nano Banana');
    expect(getVideoModelLabel('veo-3.1')).toBe('Veo 3.1');
    expect(getLipSyncModelLabel('sync/lipsync-2')).toBe('Sync Labs (Video)');
    expect(getLLMModelLabel(DEFAULT_LLM_MODEL)).toBe('Llama 3.1 405B');
  });

  it('falls back to the raw model id for unknown models', () => {
    expect(
      getImageModelLabel('mystery' as Parameters<typeof getImageModelLabel>[0]),
    ).toBe('mystery');
    expect(
      getVideoModelLabel('mystery' as Parameters<typeof getVideoModelLabel>[0]),
    ).toBe('mystery');
    expect(
      getLipSyncModelLabel(
        'mystery' as Parameters<typeof getLipSyncModelLabel>[0],
      ),
    ).toBe('mystery');
    expect(
      getLLMModelLabel('mystery' as Parameters<typeof getLLMModelLabel>[0]),
    ).toBe('mystery');
  });
});

describe('lipSyncModelSupportsImage', () => {
  it('reflects the supportsImage flag', () => {
    expect(lipSyncModelSupportsImage('bytedance/omni-human')).toBe(true);
    expect(lipSyncModelSupportsImage('sync/lipsync-2')).toBe(false);
  });

  it('defaults to false for unknown models', () => {
    expect(
      lipSyncModelSupportsImage(
        'mystery' as Parameters<typeof lipSyncModelSupportsImage>[0],
      ),
    ).toBe(false);
  });
});
