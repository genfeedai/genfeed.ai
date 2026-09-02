import { VoiceProvider } from '@genfeedai/enums';
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

  it('rejects blank identifiers even when clone state is implied elsewhere', () => {
    const candidate = {
      externalVoiceId: '   ',
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: '   ',
    };

    expect(isMaterializableSavedVoice(candidate)).toBe(false);
  });

  it('does not treat an unsupported provider identifier as materializable', () => {
    const candidate = {
      externalVoiceId: 'hedra-voice-1',
      provider: VoiceProvider.HEDRA,
      sampleAudioUrl: null,
    };

    expect(isMaterializableSavedVoice(candidate)).toBe(false);
  });

  it('fails closed for missing candidates', () => {
    expect(isMaterializableSavedVoice(null)).toBe(false);
    expect(isMaterializableSavedVoice(undefined)).toBe(false);
  });
});
