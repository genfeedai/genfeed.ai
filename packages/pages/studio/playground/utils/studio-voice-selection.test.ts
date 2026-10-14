import { VoiceProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  isStudioVoiceSelectionValid,
  resolveSpeakingVoiceProvider,
  resolveSpeechVoiceProvider,
} from './studio-voice-selection';

const elevenLabsRef = {
  externalVoiceId: 'voice-1',
  provider: VoiceProvider.ELEVENLABS,
  source: 'catalog',
} as const;
const heyGenRef = {
  externalVoiceId: 'clone-1',
  ownership: 'private',
  provider: VoiceProvider.HEYGEN,
  source: 'catalog',
} as const;

describe('resolveSpeakingVoiceProvider', () => {
  it('maps each speech model to the provider whose voices it speaks', () => {
    expect(resolveSpeakingVoiceProvider(MODEL_KEYS.ELEVENLABS_V4)).toBe(
      VoiceProvider.ELEVENLABS,
    );
    expect(resolveSpeakingVoiceProvider(MODEL_KEYS.HEYGEN_VOICE)).toBe(
      VoiceProvider.HEYGEN,
    );
  });

  it.each(['auto', '', undefined, 'heygen/avatar'])(
    'allows every provider for %s',
    (modelKey) => {
      expect(resolveSpeakingVoiceProvider(modelKey)).toBeUndefined();
    },
  );
});

describe('resolveSpeechVoiceProvider', () => {
  it('returns the provider of a voice Studio can speak', () => {
    expect(resolveSpeechVoiceProvider(elevenLabsRef)).toBe(
      VoiceProvider.ELEVENLABS,
    );
    expect(resolveSpeechVoiceProvider(heyGenRef)).toBe(VoiceProvider.HEYGEN);
  });

  it('returns undefined for a missing or unsupported provider', () => {
    expect(resolveSpeechVoiceProvider(undefined)).toBeUndefined();
    expect(
      resolveSpeechVoiceProvider({
        externalVoiceId: 'x',
        provider: VoiceProvider.HEDRA,
        source: 'catalog',
      }),
    ).toBeUndefined();
  });
});

describe('isStudioVoiceSelectionValid', () => {
  it('accepts an empty selection', () => {
    expect(isStudioVoiceSelectionValid({ modelKey: 'auto' })).toBe(true);
  });

  it('accepts either provider under Auto', () => {
    expect(
      isStudioVoiceSelectionValid({
        modelKey: 'auto',
        voiceId: 'voice-1',
        voiceRef: elevenLabsRef,
      }),
    ).toBe(true);
    expect(
      isStudioVoiceSelectionValid({
        modelKey: 'auto',
        voiceId: 'clone-1',
        voiceRef: heyGenRef,
      }),
    ).toBe(true);
  });

  it('accepts a voice whose provider matches the chosen model', () => {
    expect(
      isStudioVoiceSelectionValid({
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        voiceId: 'clone-1',
        voiceRef: heyGenRef,
      }),
    ).toBe(true);
  });

  it('rejects a voice from the other provider than the chosen model', () => {
    expect(
      isStudioVoiceSelectionValid({
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        voiceId: 'voice-1',
        voiceRef: elevenLabsRef,
      }),
    ).toBe(false);
    expect(
      isStudioVoiceSelectionValid({
        modelKey: MODEL_KEYS.ELEVENLABS_V4,
        voiceId: 'clone-1',
        voiceRef: heyGenRef,
      }),
    ).toBe(false);
  });

  it('rejects a voice id with no provider or a provider Studio cannot speak', () => {
    expect(
      isStudioVoiceSelectionValid({ modelKey: 'auto', voiceId: 'legacy' }),
    ).toBe(false);
    expect(
      isStudioVoiceSelectionValid({
        modelKey: 'auto',
        voiceId: 'hedra-1',
        voiceRef: {
          externalVoiceId: 'hedra-1',
          provider: VoiceProvider.HEDRA,
          source: 'catalog',
        },
      }),
    ).toBe(false);
  });
});
