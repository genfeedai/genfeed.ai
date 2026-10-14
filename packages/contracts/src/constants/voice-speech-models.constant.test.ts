import { describe, expect, it } from 'vitest';
import { ModelCategory, VoiceProvider } from '..';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { MODEL_KEYS } from './model-keys.constant';
import { SELF_HOSTED_MODELS } from './self-hosted-models.constant';
import {
  countSpeechCharacters,
  getVoiceSpeechModel,
  isVoiceSpeechModel,
  VOICE_SPEECH_MODELS,
  voiceSpeechModelKeysFor,
} from './voice-speech-models.constant';

describe('VOICE_SPEECH_MODELS', () => {
  it('lists only seeded, Recommended VOICE rows', () => {
    for (const key of Object.keys(VOICE_SPEECH_MODELS)) {
      expect(MODEL_OUTPUT_CAPABILITIES[key]?.category).toBe(
        ModelCategory.VOICE,
      );
      expect(
        SELF_HOSTED_MODELS.find((model) => model.key === key),
      ).toBeDefined();
    }
  });

  it('keeps avatar rows in the VOICE category out of speech', () => {
    expect(isVoiceSpeechModel(MODEL_KEYS.HEYGEN_AVATAR)).toBe(false);
    expect(isVoiceSpeechModel(MODEL_KEYS.ARGIL_ATOM)).toBe(false);
    expect(isVoiceSpeechModel(undefined)).toBe(false);
  });

  it('maps each voice catalog to the models that can speak it', () => {
    expect(voiceSpeechModelKeysFor(VoiceProvider.ELEVENLABS)).toEqual([
      MODEL_KEYS.ELEVENLABS_V4,
      MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
      MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
    ]);
    expect(voiceSpeechModelKeysFor(VoiceProvider.HEYGEN)).toEqual([
      MODEL_KEYS.HEYGEN_VOICE,
    ]);
    expect(voiceSpeechModelKeysFor(VoiceProvider.HEDRA)).toEqual([]);
  });

  it('carries the documented per-request text limits', () => {
    expect(getVoiceSpeechModel(MODEL_KEYS.HEYGEN_VOICE)?.maxCharacters).toBe(
      5_000,
    );
    expect(
      getVoiceSpeechModel(MODEL_KEYS.ELEVENLABS_FLASH_V2_5)?.maxCharacters,
    ).toBe(40_000);
  });

  it('counts billable characters as Unicode code points', () => {
    expect(countSpeechCharacters('Hi, 👋 there.')).toBe(12);
    expect(countSpeechCharacters('')).toBe(0);
  });
});
