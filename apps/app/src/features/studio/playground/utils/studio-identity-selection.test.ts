import { VoiceProvider } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { hasStudioVoiceSelection } from '@/features/studio/playground/utils/studio-identity-selection';

const voiceRef = {
  externalVoiceId: 'voice-1',
  provider: VoiceProvider.ELEVENLABS,
  source: 'catalog',
} as const;

describe('hasStudioVoiceSelection', () => {
  it('needs both the voice id and the ref that carries its provider', () => {
    expect(hasStudioVoiceSelection({ voiceId: 'voice-1', voiceRef })).toBe(
      true,
    );
  });

  it.each([
    ['nothing', {}],
    ['an id without its provider ref', { voiceId: 'voice-1' }],
    ['a ref without an id', { voiceRef }],
  ])('is false for %s', (_label, selection) => {
    expect(hasStudioVoiceSelection(selection)).toBe(false);
  });
});
