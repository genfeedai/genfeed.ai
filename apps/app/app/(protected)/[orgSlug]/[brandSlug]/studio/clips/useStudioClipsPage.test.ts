import type {
  HeyGenAvatarRef,
  IBrand,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAnalyzeVideo = vi.fn();
const mockGetHighlights = vi.fn();
const mockGetHookApproval = vi.fn();
const mockGetProject = vi.fn();
const mockGetToken = vi.fn();
const mockPush = vi.fn();
const mockSaveDraft = vi.fn();
const mockRetrySource = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: 'brand-1' }, settings: null }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mockGetToken }),
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
    getHighlights = mockGetHighlights;
    getHookApproval = mockGetHookApproval;
    getProject = mockGetProject;
    saveDraft = mockSaveDraft;
    retrySource = mockRetrySource;
  },
}));

import {
  CLIP_DRAFT_AUTOSAVE_DELAY_MS,
  resolveAvatarProviderSelection,
  resolveClipsStepFromStatus,
  resolveQuickAvatarIdentity,
  resolveStudioClipIdentityDefaults,
  useStudioClipsPage,
} from './useStudioClipsPage';

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveDraft.mockResolvedValue(undefined);
  mockRetrySource.mockResolvedValue({ status: 'queued' });
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

  it('does not expose review controls until analyzed highlights are hydrated', async () => {
    let resolveHighlights:
      | ((value: {
          highlights: Array<{
            clip_type: string;
            end: number;
            id: string;
            start: number;
            summary: string;
            title: string;
            virality_score: number;
          }>;
          status: string;
        }) => void)
      | undefined;

    mockGetProject.mockResolvedValue({
      status: 'analyzed',
      name: 'Persisted source title',
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      transcriptText: 'Persisted source transcript.',
    });
    mockGetHookApproval.mockResolvedValue(null);
    mockGetHighlights.mockReturnValue(
      new Promise((resolve) => {
        resolveHighlights = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'clip-project-1' }),
    );

    await waitFor(() => {
      expect(mockGetHighlights).toHaveBeenCalledWith(
        'clip-project-1',
        expect.any(AbortSignal),
      );
    });

    expect(result.current.isHydrating).toBe(true);
    expect(result.current.project).toBeNull();

    await act(async () => {
      resolveHighlights?.({
        highlights: [
          {
            clip_type: 'hook',
            end: 8,
            id: 'highlight-1',
            start: 0,
            summary: 'Original summary',
            title: 'The Hook',
            virality_score: 92,
          },
        ],
        status: 'analyzed',
      });
    });

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
      expect(result.current.step).toBe('review');
      expect(result.current.editedHighlights).toEqual([
        expect.objectContaining({ id: 'highlight-1', title: 'The Hook' }),
      ]);
      expect(result.current.selectedIds).toEqual(new Set(['highlight-1']));
    });
    expect(result.current.project).toMatchObject({
      name: 'Persisted source title',
      sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      transcriptText: 'Persisted source transcript.',
    });
  });
});

describe('failed projects', () => {
  it('keeps the failure reason when a failed project is reopened', async () => {
    mockGetProject.mockResolvedValue({
      error: 'Avatar provider rejected the job',
      name: 'Quick run',
      settings: { mode: 'avatar' },
      status: 'failed',
    });
    mockGetHookApproval.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'clip-project-1' }),
    );

    await waitFor(() => expect(result.current.isHydrating).toBe(false));
    expect(result.current.step).toBe('progress');
    expect(result.current.project).toMatchObject({
      error: 'Avatar provider rejected the job',
      status: 'failed',
    });
  });
});

describe('draft projects', () => {
  const draftProject = {
    draft: {
      sourceKind: 'youtube',
      updatedAt: '2026-09-28T12:00:00.000Z',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    settings: { maxClips: 7, minViralityScore: 64, mode: 'raw-cut' },
    status: 'draft',
  };

  beforeEach(() => {
    mockGetHookApproval.mockResolvedValue(null);
  });

  it('restores the saved source and settings on reload without re-saving them', async () => {
    mockGetProject.mockResolvedValue(draftProject);

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'draft-1' }),
    );

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
      expect(result.current.step).toBe('input');
    });
    expect(result.current.youtubeUrl).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(result.current.sourceKind).toBe('youtube');
    expect(result.current.maxClips).toBe(7);
    expect(result.current.minViralityScore).toBe(64);
    expect(result.current.generationMode).toBe('raw-cut');
    expect(result.current.project).toMatchObject({
      projectId: 'draft-1',
      status: 'draft',
    });
    expect(mockGetHighlights).not.toHaveBeenCalled();

    await new Promise((resolve) =>
      setTimeout(resolve, CLIP_DRAFT_AUTOSAVE_DELAY_MS + 200),
    );
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it('restores an upload draft by filename and waits for the file again', async () => {
    mockGetProject.mockResolvedValue({
      ...draftProject,
      draft: {
        filename: 'podcast.mp4',
        sourceKind: 'upload',
        updatedAt: '2026-09-28T12:00:00.000Z',
      },
    });

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'draft-1' }),
    );

    await waitFor(() => {
      expect(result.current.sourceKind).toBe('upload');
    });
    expect(result.current.draftFilename).toBe('podcast.mp4');
    expect(result.current.sourceFile).toBeNull();
  });

  it('autosaves form changes within two seconds', async () => {
    mockGetProject.mockResolvedValue(draftProject);

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'draft-1' }),
    );
    await waitFor(() => {
      expect(result.current.step).toBe('input');
    });

    const changedAt = Date.now();
    act(() => {
      result.current.setYoutubeUrl('https://youtu.be/aaaaaaaaaaa');
      result.current.setMaxClips(12);
    });

    await waitFor(
      () => {
        expect(mockSaveDraft).toHaveBeenCalledWith('draft-1', {
          filename: undefined,
          maxClips: 12,
          minViralityScore: 64,
          mode: 'raw-cut',
          sourceKind: 'youtube',
          youtubeUrl: 'https://youtu.be/aaaaaaaaaaa',
        });
      },
      { timeout: 2_000 },
    );
    expect(Date.now() - changedAt).toBeLessThan(2_000);
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.draftSaveState).toBe('saved');
    });
  });

  it('saves a revert made while the previous autosave was in flight', async () => {
    mockGetProject.mockResolvedValue(draftProject);
    let finishFirstSave: (() => void) | undefined;
    mockSaveDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirstSave = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'draft-1' }),
    );
    await waitFor(() => {
      expect(result.current.step).toBe('input');
    });

    act(() => {
      result.current.setMaxClips(12);
    });
    await waitFor(
      () => {
        expect(mockSaveDraft).toHaveBeenCalledTimes(1);
      },
      { timeout: 2_000 },
    );
    expect(mockSaveDraft.mock.calls[0]?.[1]).toMatchObject({ maxClips: 12 });

    // Back to the saved value while the save of 12 is still running.
    act(() => {
      result.current.setMaxClips(7);
    });
    await act(async () => {
      finishFirstSave?.();
    });

    await waitFor(
      () => {
        expect(mockSaveDraft).toHaveBeenCalledTimes(2);
      },
      { timeout: 2_000 },
    );
    expect(mockSaveDraft.mock.calls[1]?.[1]).toMatchObject({ maxClips: 7 });
    await waitFor(() => {
      expect(result.current.draftSaveState).toBe('saved');
    });
  });

  it('starts analysis on the draft in place', async () => {
    mockGetProject.mockResolvedValue(draftProject);
    mockAnalyzeVideo.mockResolvedValue({ projectId: 'draft-1' });
    mockGetHighlights.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() =>
      useStudioClipsPage({ projectId: 'draft-1' }),
    );
    await waitFor(() => {
      expect(result.current.step).toBe('input');
    });

    await act(async () => {
      await result.current.handleAnalyze();
    });

    expect(mockAnalyzeVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        draftProjectId: 'draft-1',
        maxClips: 7,
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.step).toBe('review');
    expect(result.current.project).toMatchObject({
      projectId: 'draft-1',
      status: 'analyzing',
    });
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

  it('opens a draft on the setup form', () => {
    expect(resolveClipsStepFromStatus('draft')).toBe('input');
  });

  it('opens analyzed and in-flight analysis on review', () => {
    expect(resolveClipsStepFromStatus('analyzed')).toBe('review');
    expect(resolveClipsStepFromStatus('analyzing')).toBe('review');
    expect(resolveClipsStepFromStatus('pending')).toBe('review');
  });
});

describe('resolveStudioClipIdentityDefaults', () => {
  const nativeAvatar: HeyGenAvatarRef = {
    version: 1,
    source: 'heygen-look',
    provider: 'heygen',
    lookId: 'native-look',
    groupId: null,
    ownership: 'public',
    label: 'Native look',
    preview: null,
    avatarType: 'studio_avatar',
    supportedEngines: ['avatar_iv'],
    readiness: {
      lookStatus: 'completed',
      groupStatus: null,
      consentStatus: null,
      usable: true,
      reason: null,
    },
    connection: {
      provider: 'heygen',
      kind: 'platform',
      organizationId: 'org-a',
    },
  };
  it('recognizes canonical brand and organization avatar defaults without legacy IDs', () => {
    const settings = {
      defaultAvatarRef: nativeAvatar,
      defaultVoiceRef: {
        source: 'catalog',
        provider: 'HEYGEN',
        externalVoiceId: 'voice-a',
      },
    } as Pick<IOrganizationSetting, 'defaultAvatarRef' | 'defaultVoiceRef'>;
    expect(resolveStudioClipIdentityDefaults({ settings })).toMatchObject({
      avatarId: 'native-look',
      voiceId: 'voice-a',
      isComplete: true,
      source: 'organization',
    });
    const brand = {
      agentConfig: {
        defaultAvatarRef: { ...nativeAvatar, lookId: 'brand-look' },
      },
    } as Pick<IBrand, 'agentConfig'>;
    expect(
      resolveStudioClipIdentityDefaults({ settings, selectedBrand: brand }),
    ).toMatchObject({
      avatarId: 'brand-look',
      voiceId: 'voice-a',
      isComplete: true,
      source: 'brand',
    });
  });

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

describe('source retry presentation', () => {
  it.each(['review', 'quick'] as const)(
    'keeps %s source recovery in its actual flow',
    async (flow) => {
      const failedProject = {
        status: 'failed',
        settings: { mode: 'avatar' },
        source: {
          schemaVersion: 1,
          kind: 'youtube',
          flow,
          status: 'failed',
          fingerprint: 'source-fingerprint',
          jobId: 'clip-analysis-clip-project-1',
          retryCount: 0,
          maxRetries: 3,
          updatedAt: '2026-10-10T00:00:00Z',
        },
      };
      mockGetProject.mockResolvedValue(failedProject);
      mockRetrySource.mockImplementation(async () => {
        mockGetProject.mockResolvedValue({
          ...failedProject,
          status: 'analyzing',
          source: { ...failedProject.source, status: 'queued', retryCount: 1 },
        });
        mockGetHighlights.mockResolvedValue({
          status: 'analyzing',
          highlights: [],
        });
        return { status: 'queued' };
      });
      mockGetHookApproval.mockResolvedValue(null);
      mockGetHighlights.mockResolvedValue({ status: 'failed', highlights: [] });
      const { result } = renderHook(() =>
        useStudioClipsPage({ projectId: 'clip-project-1' }),
      );
      await waitFor(() =>
        expect(result.current.project?.status).toBe('failed'),
      );
      await act(async () => {
        await result.current.handleRetrySource();
      });
      expect(mockRetrySource).toHaveBeenCalledWith('clip-project-1');
      expect(result.current.step).toBe(
        flow === 'review' ? 'review' : 'progress',
      );
      expect(result.current.project?.source?.retryCount).toBe(1);
    },
  );
});
