import {
  parseVoiceCatalogProvider,
  parseVoiceCatalogProviders,
  parseVoiceProviders,
  toLibraryVoiceDocument,
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

  it('maps catalog rows onto the library Voice read model', () => {
    const voice = {
      createdAt: new Date('2026-01-01'),
      externalId: 'eleven-rachel',
      externalProvider: DbVoiceProvider.ELEVENLABS,
      id: 'catalog-1',
      isActive: true,
      isDefaultSelectable: true,
      isFeatured: false,
      language: 'en',
      name: 'Rachel',
      providerData: {},
      sampleAudioUrl: 'https://example.test/rachel.mp3',
      updatedAt: new Date('2026-01-02'),
    } as ExternalVoice;

    expect(toLibraryVoiceDocument(voice)).toMatchObject({
      category: 'VOICE',
      externalVoiceCatalogId: 'catalog-1',
      externalVoiceId: 'eleven-rachel',
      id: 'catalog-1',
      isCloned: false,
      isVoiceActive: true,
      metadata: { label: 'Rachel' },
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: 'https://example.test/rachel.mp3',
      voiceProvider: VoiceProvider.ELEVENLABS,
      voiceSource: 'catalog',
    });
  });
});
