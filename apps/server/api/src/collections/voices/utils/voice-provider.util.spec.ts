import {
  parseVoiceCatalogProvider,
  parseVoiceCatalogProviders,
  parseVoiceProviders,
  toVoiceCatalogWireFormat,
} from '@api/collections/voices/utils/voice-provider.util';
import { VoiceProvider } from '@genfeedai/enums';
import {
  VoiceProvider as DbVoiceProvider,
  type ExternalVoice,
} from '@genfeedai/prisma';

describe('voice provider utilities', () => {
  it('normalizes app query casing to a syncable database provider', () => {
    expect(parseVoiceCatalogProvider(' elevenlabs ')).toBe(
      DbVoiceProvider.ELEVENLABS,
    );
    expect(parseVoiceCatalogProvider('genfeed_ai')).toBeUndefined();
  });

  it('drops non-catalog providers during import', () => {
    expect(
      parseVoiceCatalogProviders([
        VoiceProvider.GENFEED_AI,
        VoiceProvider.HEYGEN,
      ]),
    ).toEqual([DbVoiceProvider.HEYGEN]);
  });

  it('falls back to all supported library providers for invalid input', () => {
    expect(parseVoiceProviders('unknown')).toEqual([
      VoiceProvider.ELEVENLABS,
      VoiceProvider.HEYGEN,
      VoiceProvider.GENFEED_AI,
    ]);
  });

  it('maps database catalog fields onto the stable wire contract', () => {
    const voice = {
      createdAt: new Date('2026-01-01'),
      externalId: 'external-1',
      externalProvider: DbVoiceProvider.HEYGEN,
      id: 'voice-1',
      isActive: true,
      isDefaultSelectable: false,
      isFeatured: true,
      language: 'en',
      name: 'Narrator',
      providerData: {},
      sampleAudioUrl: null,
      updatedAt: new Date('2026-01-02'),
    } as ExternalVoice;

    expect(toVoiceCatalogWireFormat(voice)).toMatchObject({
      externalVoiceId: 'external-1',
      provider: VoiceProvider.HEYGEN,
    });
  });
});
