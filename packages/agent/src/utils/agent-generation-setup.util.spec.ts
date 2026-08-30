import { RouterPriority } from '@genfeedai/enums';
import type { GenerationSetupValues } from '@genfeedai/interfaces/studio/generation-setup.interface';
import { describe, expect, it } from 'vitest';
import {
  AGENT_GENERATION_SETUP_TYPE_OPTIONS,
  buildConversationComposerGenerationSettings,
  buildDefaultAgentGenerationSetupValues,
  getAgentGenerationSetupCapabilities,
  isAgentGenerationType,
} from './agent-generation-setup.util';

describe('isAgentGenerationType', () => {
  it('accepts image and video', () => {
    expect(isAgentGenerationType('image')).toBe(true);
    expect(isAgentGenerationType('video')).toBe(true);
  });

  it('rejects other generation types and nullish values', () => {
    expect(isAgentGenerationType('text')).toBe(false);
    expect(isAgentGenerationType(undefined)).toBe(false);
    expect(isAgentGenerationType(null)).toBe(false);
  });
});

describe('getAgentGenerationSetupCapabilities', () => {
  it('returns image capabilities with outputs but no duration', () => {
    const capabilities = getAgentGenerationSetupCapabilities('image');

    expect(capabilities.hasOutputs).toBe(true);
    expect(capabilities.hasDuration).toBe(false);
    expect(capabilities.hasAspectRatio).toBe(true);
    expect(capabilities.hasModelSelection).toBe(true);
  });

  it('returns video capabilities with duration but no outputs', () => {
    const capabilities = getAgentGenerationSetupCapabilities('video');

    expect(capabilities.hasOutputs).toBe(false);
    expect(capabilities.hasDuration).toBe(true);
    expect(capabilities.hasAspectRatio).toBe(true);
    expect(capabilities.hasModelSelection).toBe(true);
  });
});

describe('AGENT_GENERATION_SETUP_TYPE_OPTIONS', () => {
  it('offers exactly image and video', () => {
    expect(AGENT_GENERATION_SETUP_TYPE_OPTIONS).toEqual([
      { label: 'Image', value: 'image' },
      { label: 'Video', value: 'video' },
    ]);
  });
});

describe('buildDefaultAgentGenerationSetupValues', () => {
  it('seeds image defaults with a square aspect ratio and no duration', () => {
    const values = buildDefaultAgentGenerationSetupValues('image');

    expect(values).toEqual({
      aspectRatio: '1:1',
      brandingMode: 'brand',
      duration: undefined,
      isPromptEnhanceEnabled: true,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      type: 'image',
    });
  });

  it('seeds video defaults with a widescreen aspect ratio and a 5s duration', () => {
    const values = buildDefaultAgentGenerationSetupValues('video');

    expect(values).toEqual({
      aspectRatio: '16:9',
      brandingMode: 'brand',
      duration: 5,
      isPromptEnhanceEnabled: true,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      type: 'video',
    });
  });

  it('defaults modelKey to empty string (Auto) when omitted', () => {
    expect(buildDefaultAgentGenerationSetupValues('image').modelKey).toBe('');
  });

  it('accepts an explicit modelKey override', () => {
    const values = buildDefaultAgentGenerationSetupValues(
      'image',
      'flux-schnell',
    );

    expect(values.modelKey).toBe('flux-schnell');
  });
});

describe('buildConversationComposerGenerationSettings', () => {
  const baseValues: GenerationSetupValues = {
    aspectRatio: '1:1',
    brandingMode: 'brand',
    duration: undefined,
    isPromptEnhanceEnabled: true,
    modelKey: '',
    outputs: 2,
    prioritize: RouterPriority.BALANCED,
    type: 'image',
  };

  it('maps aspectRatio, duration, and outputs through unchanged', () => {
    const settings = buildConversationComposerGenerationSettings({
      ...baseValues,
      duration: 5,
    });

    expect(settings.aspectRatio).toBe('1:1');
    expect(settings.duration).toBe(5);
    expect(settings.outputs).toBe(2);
  });

  it('maps an empty modelKey (Auto) to undefined', () => {
    const settings = buildConversationComposerGenerationSettings(baseValues);

    expect(settings.model).toBeUndefined();
  });

  it('maps a non-empty modelKey through as model', () => {
    const settings = buildConversationComposerGenerationSettings({
      ...baseValues,
      modelKey: 'flux-schnell',
    });

    expect(settings.model).toBe('flux-schnell');
  });
});
