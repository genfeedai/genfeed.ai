import type { IBrand, IOrganizationSetting } from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAnalyzeVideo = vi.fn();
const mockPush = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: 'brand-1' }, settings: null }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/test-org/brand-1${path}`,
  }),
}));

vi.mock('@hooks/ui/use-document-visibility/use-document-visibility', () => ({
  useDocumentVisibility: () => true,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    GENERATION_COMPLETED: 'generation_completed',
    GENERATION_STARTED: 'generation_started',
  },
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock('./services/clips-api.service', () => ({
  ClipsApiService: class {
    analyzeVideo = mockAnalyzeVideo;
  },
}));

import {
  resolveAvatarProviderSelection,
  resolveClipsStepFromStatus,
  resolveQuickAvatarIdentity,
  resolveStudioClipIdentityDefaults,
  useStudioClipsPage,
} from './useStudioClipsPage';

beforeEach(() => {
  vi.clearAllMocks();
  mockAnalyzeVideo.mockResolvedValue({
    identity: {
      avatarProvider: 'heygen',
      isComplete: false,
      label: 'Missing clip identity',
      missing: ['avatar', 'voice'],
      source: 'missing',
    },
    projectId: 'clip-project-1',
  });
});

describe('review route transition', () => {
  it('keeps editable review state behind the canonical project route', async () => {
    const { result } = renderHook(() => useStudioClipsPage());

    act(() => {
      result.current.setYoutubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    await act(async () => {
      await result.current.handleAnalyze();
    });

    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/test-org/brand-1/studio/clips/clip-project-1',
    );
    expect(result.current.project).toBeNull();
    expect(result.current.step).toBe('input');
  });
});

const identityDefaults = {
  avatarId: 'saved-heygen-avatar',
  avatarProvider: 'heygen' as const,
  isComplete: true,
  missing: [],
  source: 'brand' as const,
  voiceId: 'saved-heygen-voice',
};

describe('resolveClipsStepFromStatus', () => {
  it('opens completed and generating projects on the results surface', () => {
    expect(resolveClipsStepFromStatus('completed')).toBe('progress');
    expect(resolveClipsStepFromStatus('generating')).toBe('progress');
    expect(resolveClipsStepFromStatus('failed')).toBe('progress');
  });

  it('opens analyzed and in-flight analysis on review', () => {
    expect(resolveClipsStepFromStatus('analyzed')).toBe('review');
    expect(resolveClipsStepFromStatus('analyzing')).toBe('review');
    expect(resolveClipsStepFromStatus('pending')).toBe('review');
  });
});

describe('resolveStudioClipIdentityDefaults', () => {
  it('prefills saved brand HeyGen avatar and voice defaults', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-1',
        heygenVoiceId: 'brand-voice-1',
      },
    } satisfies Pick<IBrand, 'agentConfig'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings: null }),
    ).toEqual({
      avatarId: 'brand-avatar-1',
      avatarProvider: 'heygen',
      isComplete: true,
      missing: [],
      source: 'brand',
      voiceId: 'brand-voice-1',
    });
  });

  it('combines saved brand avatar with organization HeyGen voice ref', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-2',
      },
    } satisfies Pick<IBrand, 'agentConfig'>;
    const settings = {
      defaultVoiceRef: {
        externalVoiceId: 'org-voice-2',
        provider: 'heygen',
        source: 'catalog',
      },
    } satisfies Pick<IOrganizationSetting, 'defaultVoiceRef'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings }),
    ).toEqual({
      avatarId: 'brand-avatar-2',
      avatarProvider: 'heygen',
      isComplete: true,
      missing: [],
      source: 'brand',
      voiceId: 'org-voice-2',
    });
  });

  it('ignores non-HeyGen voice refs for direct clip generation', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-3',
        defaultVoiceRef: {
          externalVoiceId: 'elevenlabs-voice-3',
          provider: 'elevenlabs',
          source: 'catalog',
        },
      },
    } satisfies Pick<IBrand, 'agentConfig'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings: null }),
    ).toEqual({
      avatarId: 'brand-avatar-3',
      avatarProvider: 'heygen',
      isComplete: false,
      missing: ['voice'],
      source: 'brand',
      voiceId: undefined,
    });
  });
});

describe('avatar provider selection', () => {
  it('preserves manually entered IDs when the active provider is selected again', () => {
    expect(
      resolveAvatarProviderSelection({
        avatarProvider: 'argil',
        identityDefaults,
        provider: 'argil',
      }),
    ).toBeNull();
  });

  it('loads HeyGen defaults only when switching back to their provider', () => {
    expect(
      resolveAvatarProviderSelection({
        avatarProvider: 'argil',
        identityDefaults,
        provider: 'heygen',
      }),
    ).toEqual({
      avatarId: 'saved-heygen-avatar',
      voiceId: 'saved-heygen-voice',
    });
  });
});

describe('quick avatar identity', () => {
  it('does not mix saved HeyGen IDs into an Argil request', () => {
    expect(
      resolveQuickAvatarIdentity({
        avatarId: '',
        avatarProvider: 'argil',
        identityDefaults,
        voiceId: '',
      }),
    ).toEqual({ avatarId: undefined, voiceId: undefined });
  });

  it('preserves saved defaults for HeyGen quick start', () => {
    expect(
      resolveQuickAvatarIdentity({
        avatarId: '',
        avatarProvider: 'heygen',
        identityDefaults,
        voiceId: '',
      }),
    ).toEqual({
      avatarId: 'saved-heygen-avatar',
      voiceId: 'saved-heygen-voice',
    });
  });
});
