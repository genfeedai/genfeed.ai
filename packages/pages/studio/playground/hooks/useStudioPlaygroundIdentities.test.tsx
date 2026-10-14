import { VoiceProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
  HeyGenSpeechVoice,
} from '@genfeedai/contracts/interfaces';
import type { Voice } from '@models/ingredients/voice.model';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundIdentities } from './useStudioPlaygroundIdentities';

const mocks = vi.hoisted(() => ({
  avatars: [] as HeyGenCatalogAvatar[],
  catalogVoices: [] as Voice[],
  catalogOptions: vi.fn(),
  hasPersonalConnection: true,
  isSpeechLoaded: true,
  speechOptions: vi.fn(),
  speechRetry: vi.fn(),
  speechVoices: [] as HeyGenSpeechVoice[],
  voices: [] as HeyGenCatalogVoice[],
  retry: vi.fn(),
  hasMoreAvatars: false,
  loadMoreAvatars: vi.fn(),
  isLoadingMoreAvatars: false,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-a' }),
}));
vi.mock('@hooks/data/ingredients/use-avatar-images/use-avatar-images', () => ({
  useAvatarImages: () => ({ avatars: [], isLoading: false }),
}));
vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: () => ({ voices: mocks.catalogVoices, isLoading: false }),
}));
vi.mock('@hooks/data/integrations/use-heygen-catalog', () => ({
  useHeyGenCatalog: (options?: { isEnabled?: boolean }) => {
    mocks.catalogOptions(options);
    return { ...mocks, error: null, isLoading: false };
  },
}));
vi.mock('@hooks/data/integrations/use-heygen-speech-voices', () => ({
  useHeyGenSpeechVoices: (options?: { isEnabled?: boolean }) => {
    mocks.speechOptions(options);
    return {
      error: null,
      hasPersonalConnection: mocks.hasPersonalConnection,
      isLoaded: mocks.isSpeechLoaded,
      isLoading: false,
      retry: mocks.speechRetry,
      voices: mocks.speechVoices,
    };
  },
}));

function makeCatalogVoice(
  id: string,
  provider: VoiceProvider,
  externalVoiceId = id,
): Voice {
  return {
    externalVoiceId,
    id,
    isCloned: false,
    metadataLabel: id,
    provider,
    sampleAudioUrl: `https://assets.test/${id}.mp3`,
  } as unknown as Voice;
}

const speechVoice: HeyGenSpeechVoice = {
  language: 'en',
  mode: 'instant',
  name: 'Founder clone',
  ownership: 'private',
  voiceId: 'clone-1',
};

describe('Studio identity gallery data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.avatars = [];
    mocks.catalogVoices = [];
    mocks.hasPersonalConnection = true;
    mocks.isSpeechLoaded = true;
    mocks.speechVoices = [];
    mocks.voices = [];
  });

  it('preserves private connection and readiness alongside provider previews', () => {
    const connection = {
      provider: 'heygen',
      kind: 'byok',
      organizationId: 'org-a',
    } as const;
    mocks.avatars = [
      {
        avatarId: 'look',
        name: 'Personal avatar',
        gender: 'male',
        preview: 'https://assets.test/portrait.jpg',
        index: 0,
        avatarRef: {
          version: 1,
          source: 'heygen-look',
          provider: 'heygen',
          lookId: 'look',
          groupId: null,
          ownership: 'private',
          label: 'Personal avatar',
          preview: null,
          avatarType: null,
          supportedEngines: [],
          connection,
          readiness: {
            lookStatus: 'pending',
            groupStatus: null,
            consentStatus: null,
            usable: false,
            reason: 'Processing',
          },
        },
      },
    ];
    mocks.voices = [
      {
        voiceId: 'voice',
        name: 'Personal voice',
        gender: 'female',
        preview: 'https://assets.test/sample.mp3',
        index: 0,
        ownership: 'private',
        connection,
      },
    ];
    const { result } = renderHook(() =>
      useStudioPlaygroundIdentities({ type: 'avatar' }),
    );
    expect(result.current.avatarOptions[0]).toMatchObject({
      name: 'Personal avatar',
      gender: 'male',
      preview: mocks.avatars[0].preview,
      disabled: true,
      avatarRef: mocks.avatars[0].avatarRef,
    });
    expect(result.current.voiceOptions[0]).toMatchObject({
      name: 'Personal voice',
      source: 'HeyGen · private',
      gender: 'female',
      preview: mocks.voices[0].preview,
      voiceRef: { externalVoiceId: 'voice', ownership: 'private', connection },
    });
  });

  it('does not invent an audio sample or choose an identity when none is returned', () => {
    mocks.voices = [
      {
        voiceId: 'voice',
        name: 'Voice',
        gender: null,
        preview: '',
        index: 0,
        ownership: 'public',
        connection: {
          provider: 'heygen',
          kind: 'platform',
          organizationId: 'org-a',
        },
      },
    ];
    const { result } = renderHook(() =>
      useStudioPlaygroundIdentities({ type: 'avatar' }),
    );
    expect(result.current.voiceOptions[0].preview).toBeUndefined();
    expect(result.current.avatarOptions).toEqual([]);
    expect(result.current.retry).toBe(mocks.retry);
  });
});

describe('Studio Voice identity options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.avatars = [];
    mocks.catalogVoices = [
      makeCatalogVoice('eleven-1', VoiceProvider.ELEVENLABS),
      makeCatalogVoice('hedra-1', VoiceProvider.HEDRA),
      makeCatalogVoice('heygen-catalog-1', VoiceProvider.HEYGEN),
    ];
    mocks.hasPersonalConnection = true;
    mocks.isSpeechLoaded = true;
    mocks.speechVoices = [speechVoice];
    mocks.voices = [
      {
        voiceId: 'stock-1',
        name: 'Stock voice',
        gender: null,
        preview: '',
        index: 0,
        ownership: 'public',
        connection: {
          provider: 'heygen',
          kind: 'platform',
          organizationId: 'org-a',
        },
      },
    ];
  });

  function providersOf(
    options: ReturnType<typeof useStudioPlaygroundIdentities>['voiceOptions'],
  ) {
    return options.map((option) => option.voiceRef?.provider);
  }

  it('offers ElevenLabs catalog voices and HeyGen Voice voices, never stock HeyGen voices, under Auto', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundIdentities({ modelKey: 'auto', type: 'voice' }),
    );

    expect(providersOf(result.current.voiceOptions)).toEqual([
      VoiceProvider.ELEVENLABS,
      VoiceProvider.HEYGEN,
    ]);
    expect(result.current.voiceOptions[1]).toMatchObject({
      label: 'Founder clone (HeyGen Voice · private)',
      voiceRef: {
        externalVoiceId: 'clone-1',
        ownership: 'private',
        provider: VoiceProvider.HEYGEN,
        source: 'catalog',
      },
    });
    expect(
      result.current.voiceOptions.some((option) =>
        option.voiceRef?.externalVoiceId?.startsWith('stock'),
      ),
    ).toBe(false);
  });

  it('only fetches the HeyGen source the active type needs', () => {
    renderHook(() => useStudioPlaygroundIdentities({ type: 'voice' }));
    expect(mocks.catalogOptions).toHaveBeenLastCalledWith({ isEnabled: false });
    expect(mocks.speechOptions).toHaveBeenLastCalledWith({ isEnabled: true });

    renderHook(() => useStudioPlaygroundIdentities({ type: 'avatar' }));
    expect(mocks.catalogOptions).toHaveBeenLastCalledWith({ isEnabled: true });
    expect(mocks.speechOptions).toHaveBeenLastCalledWith({ isEnabled: false });
  });

  it('narrows voices to the provider the chosen speech model can speak', () => {
    const elevenLabs = renderHook(() =>
      useStudioPlaygroundIdentities({
        modelKey: MODEL_KEYS.ELEVENLABS_V4,
        type: 'voice',
      }),
    );
    expect(providersOf(elevenLabs.result.current.voiceOptions)).toEqual([
      VoiceProvider.ELEVENLABS,
    ]);

    const heyGen = renderHook(() =>
      useStudioPlaygroundIdentities({
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        type: 'voice',
      }),
    );
    expect(providersOf(heyGen.result.current.voiceOptions)).toEqual([
      VoiceProvider.HEYGEN,
    ]);
  });

  it('degrades to ElevenLabs voices when no HeyGen Voice voices load', () => {
    mocks.isSpeechLoaded = false;
    mocks.speechVoices = [];
    const { result } = renderHook(() =>
      useStudioPlaygroundIdentities({ modelKey: 'auto', type: 'voice' }),
    );

    expect(providersOf(result.current.voiceOptions)).toEqual([
      VoiceProvider.ELEVENLABS,
    ]);
    expect(result.current.isHeyGenSpeechLoaded).toBe(false);
    expect(result.current.hasHeyGenSpeechVoices).toBe(false);
  });

  it('reports the connection state used for the unavailable message and retries speech voices', () => {
    mocks.hasPersonalConnection = false;
    mocks.speechVoices = [];
    const { result } = renderHook(() =>
      useStudioPlaygroundIdentities({
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        type: 'voice',
      }),
    );

    expect(result.current.voiceOptions).toEqual([]);
    expect(result.current.hasHeyGenPersonalConnection).toBe(false);
    expect(result.current.hasHeyGenSpeechVoices).toBe(false);
    expect(result.current.isHeyGenSpeechLoaded).toBe(true);
    expect(result.current.retry).toBe(mocks.speechRetry);
  });
});
