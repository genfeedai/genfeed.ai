import { VoiceProvider } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  buildDefaultVoiceRefFromVoice,
  matchesDefaultVoice,
} from './default-voice-ref.helper';

describe('default-voice-ref.helper', () => {
  it('builds catalog refs for curated provider voices', () => {
    expect(
      buildDefaultVoiceRefFromVoice({
        externalVoiceId: 'voice-ext-1',
        id: 'voice-1',
        metadataLabel: 'Rachel',
        provider: VoiceProvider.ELEVENLABS,
        sampleAudioUrl: 'https://cdn.example.com/rachel.mp3',
        voiceSource: 'catalog',
      }),
    ).toEqual({
      externalVoiceId: 'voice-ext-1',
      label: 'Rachel',
      preview: 'https://cdn.example.com/rachel.mp3',
      provider: VoiceProvider.ELEVENLABS,
      source: 'catalog',
    });
  });

  it('builds internal refs for cloned and generated voices', () => {
    expect(
      buildDefaultVoiceRefFromVoice({
        id: 'voice-2',
        isCloned: true,
        metadataLabel: 'My Clone',
        provider: VoiceProvider.GENFEED_AI,
        voiceSource: 'cloned',
      }),
    ).toEqual({
      internalVoiceId: 'voice-2',
      label: 'My Clone',
      provider: VoiceProvider.GENFEED_AI,
      source: 'cloned',
    });

    expect(
      buildDefaultVoiceRefFromVoice({
        externalVoiceId: 'generated-ext',
        id: 'voice-3',
        metadataLabel: 'Generated Voice',
        provider: VoiceProvider.GENFEED_AI,
        voiceSource: 'generated',
      }),
    ).toEqual({
      internalVoiceId: 'voice-3',
      label: 'Generated Voice',
      provider: VoiceProvider.GENFEED_AI,
      source: 'cloned',
    });
  });

  it('matches defaults by internal id and catalog provider/external id', () => {
    const catalogVoice = {
      externalVoiceId: 'voice-ext-1',
      id: 'voice-1',
      provider: VoiceProvider.ELEVENLABS,
      voiceSource: 'catalog' as const,
    };
    const clonedVoice = {
      id: 'voice-2',
      provider: VoiceProvider.GENFEED_AI,
      voiceSource: 'cloned' as const,
    };

    expect(
      matchesDefaultVoice(
        {
          defaultVoiceRef: {
            externalVoiceId: 'voice-ext-1',
            provider: VoiceProvider.ELEVENLABS,
            source: 'catalog',
          },
        },
        catalogVoice,
      ),
    ).toBe(true);

    expect(
      matchesDefaultVoice(
        {
          defaultVoiceId: 'voice-2',
        },
        clonedVoice,
      ),
    ).toBe(true);

    expect(
      matchesDefaultVoice(
        {
          defaultVoiceRef: {
            internalVoiceId: 'voice-2',
            source: 'cloned',
          },
        },
        clonedVoice,
      ),
    ).toBe(true);
  });
});
