import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundIdentities } from './useStudioPlaygroundIdentities';

const mocks = vi.hoisted(() => ({
  avatars: [] as HeyGenCatalogAvatar[],
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
  useVoiceCatalog: () => ({ voices: [], isLoading: false }),
}));
vi.mock('@hooks/data/integrations/use-heygen-catalog', () => ({
  useHeyGenCatalog: () => ({ ...mocks, error: null, isLoading: false }),
}));

describe('Studio identity gallery data', () => {
  beforeEach(() => {
    mocks.avatars = [];
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
        preview: 'https://assets.test/sample.mp3',
        index: 0,
        ownership: 'private',
        connection,
      },
    ];
    const { result } = renderHook(() => useStudioPlaygroundIdentities());
    expect(result.current.avatarOptions[0]).toMatchObject({
      preview: mocks.avatars[0].preview,
      disabled: true,
      avatarRef: mocks.avatars[0].avatarRef,
    });
    expect(result.current.voiceOptions[0]).toMatchObject({
      preview: mocks.voices[0].preview,
      voiceRef: { externalVoiceId: 'voice', ownership: 'private', connection },
    });
  });

  it('does not invent an audio sample or choose an identity when none is returned', () => {
    mocks.voices = [
      {
        voiceId: 'voice',
        name: 'Voice',
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
    const { result } = renderHook(() => useStudioPlaygroundIdentities());
    expect(result.current.voiceOptions[0].preview).toBeUndefined();
    expect(result.current.avatarOptions).toEqual([]);
    expect(result.current.retry).toBe(mocks.retry);
  });
});
