import {
  renderGenerationBriefBrandVoice,
  resolveIsGenerationBriefBrandVoiceOn,
} from '@api/services/generation-brief/resolve-generation-brief-brand-context';
import { describe, expect, it } from 'vitest';

describe('resolveIsGenerationBriefBrandVoiceOn', () => {
  it.each([
    [{ brandingMode: 'brand' as const }, true],
    [{ isBrandingEnabled: true }, true],
    [{}, true],
    [{ brandingMode: 'off' as const }, false],
    [{ isBrandingEnabled: false }, false],
    [{ brandingMode: 'off' as const, isBrandingEnabled: true }, false],
  ])('%j -> %s', (input, expected) => {
    expect(resolveIsGenerationBriefBrandVoiceOn(input)).toBe(expected);
  });
});

describe('renderGenerationBriefBrandVoice', () => {
  const identity = { name: 'Acme' };

  it('renders tone, voice, audience and values from the snapshot', () => {
    expect(
      renderGenerationBriefBrandVoice({
        identity,
        voice: {
          audience: ['founders', 'makers'],
          avoid: ['#hashtags'],
          messagingPillars: ['Ship daily'],
          style: 'plain and short',
          tone: 'warm',
          values: ['honesty'],
        },
      }),
    ).toBe(
      [
        'Brand voice for Acme:',
        'Tone: warm',
        'Voice: plain and short',
        'Audience: founders, makers',
        'Values: honesty',
      ].join('\n'),
    );
  });

  it('returns undefined when the snapshot holds no voice', () => {
    expect(
      renderGenerationBriefBrandVoice({
        identity,
        voice: { audience: [], avoid: [], messagingPillars: [], values: [] },
      }),
    ).toBeUndefined();
  });

  it('caps the text at 500 characters', () => {
    const result = renderGenerationBriefBrandVoice({
      identity,
      voice: {
        audience: [],
        avoid: [],
        messagingPillars: [],
        tone: 'a'.repeat(900),
        values: [],
      },
    });
    expect(result).toHaveLength(500);
    expect(result?.endsWith('…')).toBe(true);
  });
});
