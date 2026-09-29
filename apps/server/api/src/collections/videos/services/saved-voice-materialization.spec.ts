import { VoiceProvider } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  hasMaterializableSampleAudio,
  hasSupportedExternalProviderId,
  isMaterializableSavedVoice,
} from './saved-voice-materialization';

describe('saved voice materialization contract', () => {
  it('admits a provider-backed ElevenLabs voice', () => {
    const candidate = {
      externalVoiceId: 'elevenlabs-voice-1',
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: null,
    };

    expect(hasSupportedExternalProviderId(candidate)).toBe(true);
    expect(isMaterializableSavedVoice(candidate)).toBe(true);
  });

  it('admits a provider-backed HeyGen voice', () => {
    const candidate = {
      externalVoiceId: 'heygen-voice-1',
      provider: VoiceProvider.HEYGEN,
      sampleAudioUrl: null,
    };

    expect(hasSupportedExternalProviderId(candidate)).toBe(true);
    expect(isMaterializableSavedVoice(candidate)).toBe(true);
  });

  it('admits a sample-backed Genfeed voice', () => {
    const candidate = {
      externalVoiceId: null,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: 'https://cdn.example.com/reference.wav',
    };

    expect(hasMaterializableSampleAudio(candidate)).toBe(true);
    expect(isMaterializableSavedVoice(candidate)).toBe(true);
  });

  it('rejects a clone-only voice with neither provider identity nor sample audio', () => {
    const candidate = {
      externalVoiceId: null,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: null,
    };

    expect(hasSupportedExternalProviderId(candidate)).toBe(false);
    expect(hasMaterializableSampleAudio(candidate)).toBe(false);
    expect(isMaterializableSavedVoice(candidate)).toBe(false);
  });

  it('fails closed for missing candidates', () => {
    expect(isMaterializableSavedVoice(null)).toBe(false);
    expect(isMaterializableSavedVoice(undefined)).toBe(false);
  });
});
