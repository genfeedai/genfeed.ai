import { RouterPriority } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { buildDefaultAgentGenerationSetupValues } from './agent-generation-setup.util';

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
