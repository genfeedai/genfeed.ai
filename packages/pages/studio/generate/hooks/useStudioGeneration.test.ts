import {
  IngredientCategory,
  IngredientStatus,
  RouterPriority,
} from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// ────────────────────────────────────────────────────────────
// Mock every service boundary before importing the hook
// ────────────────────────────────────────────────────────────

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: mockSubscribe }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));

const mockImagesPost = vi.fn();
const mockImagesEdit = vi.fn();
const mockImagesFindOne = vi.fn();
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      findOne: mockImagesFindOne,
      post: mockImagesPost,
      postEdit: mockImagesEdit,
    }),
  },
}));

const mockVideosPost = vi.fn();
const mockVideosFindOne = vi.fn();
vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({ findOne: mockVideosFindOne, post: mockVideosPost }),
  },
}));

const mockMusicsPost = vi.fn();
const mockMusicsFindOne = vi.fn();
vi.mock('@services/ingredients/musics.service', () => ({
  MusicsService: {
    getInstance: () => ({ findOne: mockMusicsFindOne, post: mockMusicsPost }),
  },
}));

const mockVoicesGenerate = vi.fn();
vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: () => ({ generate: mockVoicesGenerate }),
  },
}));

const mockHeyGenGenerate = vi.fn();
vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({ generate: mockHeyGenGenerate }),
  },
}));

const mockIngredientsFindOne = vi.fn();
const mockCancelGeneration = vi.fn();
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      findOne: mockIngredientsFindOne,
      cancelGeneration: mockCancelGeneration,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockNotificationsError = vi.fn();
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mockNotificationsError }),
  },
}));

interface MediaHandler {
  onFailed: (message: string) => void;
  onSuccess: (result: unknown) => Promise<void> | void;
}

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: (
    onSuccess: MediaHandler['onSuccess'],
    onFailed: MediaHandler['onFailed'],
  ) => ({ onFailed, onSuccess }),
}));

import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import { resolveModelKey, useStudioGeneration } from './useStudioGeneration';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeModel(key: string): IModel {
  return { isActive: true, key, label: key } as IModel;
}

function renderStudioGeneration(
  overrides: Partial<Parameters<typeof useStudioGeneration>[0]> = {},
) {
  const type = overrides.type ?? 'image';

  return renderHook(() =>
    useStudioGeneration({
      brandId: 'brand-1',
      models: [makeModel('flux-dev')],
      settings: getDefaultStudioGenerateSettings(type),
      type,
      ...overrides,
    }),
  );
}

function captureHandler(): { current?: MediaHandler } {
  const captured: { current?: MediaHandler } = {};

  mockSubscribe.mockImplementation((_topic: string, handler: MediaHandler) => {
    captured.current = handler;
    return mockUnsubscribe;
  });

  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mockSubscribe.mockReturnValue(mockUnsubscribe);
  mockImagesPost.mockResolvedValue({ pendingIngredientIds: ['img-1'] });
  mockVideosPost.mockResolvedValue({ pendingIngredientIds: ['vid-1'] });
  mockMusicsPost.mockResolvedValue({ pendingIngredientIds: ['mus-1'] });
  mockHeyGenGenerate.mockResolvedValue({
    data: { attributes: {}, id: 'avatar-clip-1', type: 'ingredients' },
  });
  mockVoicesGenerate.mockResolvedValue({
    id: 'voi-1',
    cdnUrl: 'https://a/v.mp3',
  });
  mockImagesFindOne.mockResolvedValue({
    id: 'img-1',
    status: IngredientStatus.PROCESSING,
  });
  mockVideosFindOne.mockResolvedValue({
    id: 'vid-1',
    status: IngredientStatus.PROCESSING,
  });
});

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('resolveModelKey', () => {
  const settings = {
    ...getDefaultStudioGenerateSettings('image'),
    modelKey: 'flux-dev',
  };

  it('keeps the chosen model when the catalog still offers it', () => {
    expect(resolveModelKey(settings, [makeModel('flux-dev')], true)).toBe(
      'flux-dev',
    );
  });

  it('never carries a previous category model into the new catalog', () => {
    // Switching image → video leaves `modelKey` pointing at an image model.
    expect(resolveModelKey(settings, [makeModel('kling-v2')], true)).toBe(
      'kling-v2',
    );
    expect(resolveModelKey(settings, [], true)).toBe('');
  });

  it('lets the router decide for auto routing and catalog-less types', () => {
    expect(
      resolveModelKey(
        { ...settings, modelKey: AUTO_MODEL_OPTION_VALUE },
        [makeModel('flux-dev')],
        true,
      ),
    ).toBe('');
    expect(resolveModelKey(settings, [makeModel('flux-dev')], false)).toBe('');
  });
});

describe('useStudioGeneration request payloads', () => {
  it.each(['image', 'video'] as const)(
    'forwards the reviewed prompt ID to %s without disabling harness or making it sticky',
    async (type) => {
      const { result } = renderStudioGeneration({ type });
      await act(async () => {
        await result.current.submit(
          'Reviewed result',
          {},
          { promptId: 'reviewed-prompt-id', requestedSkillSlugs: ['cinema'] },
        );
      });
      const post = type === 'image' ? mockImagesPost : mockVideosPost;
      expect(post.mock.calls[0]?.[0]).toMatchObject({
        promptId: 'reviewed-prompt-id',
        requestedSkillSlugs: ['cinema'],
      });
      expect(post.mock.calls[0]?.[0]).not.toHaveProperty('harness');
      await act(async () => {
        await result.current.submit('Other prompt');
      });
      expect(post.mock.calls[1]?.[0]).not.toHaveProperty('promptId');
      expect(post.mock.calls[1]?.[0]).not.toHaveProperty('requestedSkillSlugs');
      expect(post.mock.calls[1]?.[0]).not.toHaveProperty('harness');
    },
  );

  it.each(['image', 'video'] as const)(
    'forwards a per-request override to %s without making it sticky',
    async (type) => {
      const { result } = renderStudioGeneration({ type });
      let isAccepted: boolean | undefined;
      await act(async () => {
        isAccepted = await result.current.submit(
          'Reviewed result',
          {},
          { harness: false },
        );
      });
      const post = type === 'image' ? mockImagesPost : mockVideosPost;
      // Accepted by the provider: the composer may clear its draft.
      expect(isAccepted).toBe(true);
      expect(post.mock.calls[0]?.[0]).toMatchObject({ harness: false });
      await act(async () => {
        await result.current.submit('Other prompt');
      });
      expect(post.mock.calls[1]?.[0]).not.toHaveProperty('harness');
    },
  );

  it.each(['image', 'video'] as const)(
    'forwards an explicit Knowledge pick to %s without making it sticky',
    async (type) => {
      const { result } = renderStudioGeneration({ type });
      await act(async () => {
        await result.current.submit(
          'Mascot poster',
          {},
          { knowledge: { sourceIds: ['source-1'] } },
        );
      });
      const post = type === 'image' ? mockImagesPost : mockVideosPost;
      expect(post.mock.calls[0]?.[0]).toMatchObject({
        knowledge: { sourceIds: ['source-1'] },
      });
      await act(async () => {
        await result.current.submit('Other prompt');
      });
      expect(post.mock.calls[1]?.[0]).not.toHaveProperty('knowledge');
    },
  );

  it('does not forward a media enhancement override to music generation', async () => {
    const { result } = renderStudioGeneration({ type: 'music' });
    await act(async () => {
      await result.current.submit(
        'Music prompt',
        {},
        { harness: false, promptId: 'reviewed-prompt-id' },
      );
    });
    expect(mockMusicsPost).toHaveBeenCalled();
    expect(mockMusicsPost.mock.calls[0]?.[0]).not.toHaveProperty('harness');
    expect(mockMusicsPost.mock.calls[0]?.[0]).not.toHaveProperty('promptId');
  });

  it.each(['image', 'video'] as const)(
    'preserves blacklist entries and tag IDs when submitting %s',
    async (type) => {
      const blacklist = ['text, logos', 'watermark'];
      const tags = ['tag-1', 'tag-2'];
      const settings = {
        ...getDefaultStudioGenerateSettings(type),
        blacklist,
        tags,
      };
      const { result } = renderStudioGeneration({ settings, type });

      await act(async () => {
        await result.current.submit('A founder at a desk', {
          imageReferenceIds: ['reference-1'],
        });
      });

      const post = type === 'image' ? mockImagesPost : mockVideosPost;
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          blacklist,
          brand: 'brand-1',
          references: ['reference-1'],
          tags,
        }),
      );
    },
  );
});

describe('useStudioGeneration socket tracking', () => {
  it('subscribes on the ingredient collection topic for the type', async () => {
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      '/images/img-1',
      expect.anything(),
    );
    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.PROCESSING);
  });

  it('keeps the requested aspect ratio while a generated asset is pending', async () => {
    const { result } = renderStudioGeneration({
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        aspectRatio: '4:5',
      },
    });

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(result.current.jobs[0]).toMatchObject({
      height: 1024,
      ingredientId: 'img-1',
      width: 816,
    });
  });

  it('resolves the finished asset and marks the card generated', async () => {
    const ingredient = {
      cdnUrl: 'https://a/i.png',
      id: 'img-1',
      status: IngredientStatus.GENERATED,
    };
    const captured = captureHandler();
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    mockImagesFindOne.mockResolvedValue(ingredient);
    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });

    expect(mockImagesFindOne).toHaveBeenCalledWith('img-1');
    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.GENERATED);
    expect(result.current.jobs[0]?.url).toBe('https://a/i.png');
    expect(result.current.jobs[0]?.ingredient).toBe(ingredient);
  });

  it('keeps result loading recoverable when the finished asset cannot be read', async () => {
    mockImagesFindOne.mockRejectedValue(new Error('403'));
    const captured = captureHandler();
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });

    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.PROCESSING);
    expect(result.current.jobs[0]?.error).toContain('could not be loaded');
  });

  it('fails the card and toasts when the socket reports an error', async () => {
    const refreshEvents: Event[] = [];
    const recordRefresh = (event: Event) => {
      refreshEvents.push(event);
    };
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, recordRefresh);
    const captured = captureHandler();
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    await act(async () => {
      captured.current?.onFailed('GPU timeout');
    });

    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.FAILED);
    expect(mockNotificationsError).toHaveBeenCalledWith('GPU timeout');
    expect(refreshEvents).toHaveLength(1);
    window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, recordRefresh);
  });

  it('drops every subscription on unmount', async () => {
    const { result, unmount } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('stamps one run id and recipe onto every output of a submit', async () => {
    mockImagesPost.mockResolvedValueOnce({
      pendingIngredientIds: ['img-1', 'img-2', 'img-3', 'img-4'],
    });
    const { result } = renderStudioGeneration({
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        mood: 'confident',
        outputs: 4,
        style: 'editorial',
      },
    });

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(result.current.jobs).toHaveLength(4);
    const runIds = new Set(result.current.jobs.map((job) => job.runId));
    expect(runIds.size).toBe(1);
    expect([...runIds][0]).toEqual(expect.any(String));
    expect(result.current.jobs[0]?.recipe).toMatchObject({
      mood: 'confident',
      outputs: 4,
      style: 'editorial',
      text: 'A founder at a desk',
    });
    expect(mockSubscribe).toHaveBeenCalledTimes(4);
  });

  it('resubscribes in-flight jobs after unmount so PROCESSING cards are not stranded', async () => {
    const { result, unmount } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      '/images/img-1',
      expect.anything(),
    );

    unmount();
    mockSubscribe.mockClear();

    const remounted = renderStudioGeneration();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      '/images/img-1',
      expect.anything(),
    );
    expect(remounted.result.current.jobs[0]).toMatchObject({
      id: 'img-1',
      status: IngredientStatus.PROCESSING,
    });
  });

  it('resubscribes pending gallery jobs passed back in after a remount', async () => {
    const { result } = renderStudioGeneration();

    await act(async () => {
      result.current.rehydratePending([
        {
          createdAt: 1,
          id: 'stored-processing',
          prompt: 'Still rendering',
          status: IngredientStatus.PROCESSING,
          type: 'video',
        },
      ]);
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      '/videos/stored-processing',
      expect.anything(),
    );
    expect(result.current.jobs[0]?.id).toBe('stored-processing');
  });

  it('removes a live job after its persisted asset is deleted', async () => {
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });
    act(() => result.current.removeJob('img-1'));

    expect(result.current.jobs).toEqual([]);
  });
});

describe('useStudioGeneration avatar submits', () => {
  const avatarSettings = {
    ...getDefaultStudioGenerateSettings('avatar'),
    avatarPhotoUrl: 'https://cdn.genfeed.test/portrait.png',
    voiceId: 'voice-1',
  };

  it('posts the portrait url, never an ingredient id as a catalog avatar', async () => {
    const { result } = renderStudioGeneration({
      settings: avatarSettings,
      type: 'avatar',
    });

    await act(async () => {
      await result.current.submit('Hello from Genfeed');
    });

    expect(mockHeyGenGenerate).toHaveBeenCalledWith({
      photoUrl: 'https://cdn.genfeed.test/portrait.png',
      text: 'Hello from Genfeed',
      voiceId: 'voice-1',
      voiceRef: undefined,
      voiceProvider: undefined,
      avatarRef: undefined,
      useIdentity: true,
    });
    expect(mockHeyGenGenerate.mock.calls[0]?.[0]).not.toHaveProperty(
      'avatarId',
    );
  });

  it('reads the JSON:API envelope and waits on the videos topic', async () => {
    // `POST /videos/avatar` answers with a serialized ingredient and the clip
    // is published on `WebSocketPaths.video(id)`, not `/avatars/…`.
    const captured = captureHandler();
    const { result } = renderStudioGeneration({
      settings: avatarSettings,
      type: 'avatar',
    });

    await act(async () => {
      await result.current.submit('Hello from Genfeed');
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      '/videos/avatar-clip-1',
      expect.anything(),
    );

    await act(async () => {
      await captured.current?.onSuccess({ id: 'avatar-clip-1' });
    });

    expect(mockVideosFindOne).toHaveBeenCalledWith('avatar-clip-1');
    expect(mockIngredientsFindOne).not.toHaveBeenCalled();
  });

  it('lets the server resolve saved avatar defaults', async () => {
    const { result } = renderStudioGeneration({
      settings: { ...avatarSettings, avatarPhotoUrl: undefined },
      type: 'avatar',
    });

    await act(async () => {
      await result.current.submit('Hello from Genfeed');
    });

    expect(mockHeyGenGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ useIdentity: true, photoUrl: undefined }),
    );
  });
});

describe('useStudioGeneration failures', () => {
  it('leaves a failed card behind when the submit itself throws', async () => {
    // A toast disappears; the operator still needs to reprompt without
    // retyping the prompt.
    mockImagesPost.mockRejectedValue(new Error('Insufficient credits'));
    const { result } = renderStudioGeneration();
    let isAccepted: boolean | undefined;

    await act(async () => {
      isAccepted = await result.current.submit('A founder at a desk');
    });

    // The composer keeps the prompt so the operator can retry it.
    expect(isAccepted).toBe(false);
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0]).toMatchObject({
      error: 'Insufficient credits',
      height: 1024,
      prompt: 'A founder at a desk',
      status: IngredientStatus.FAILED,
      type: 'image',
      width: 1024,
    });
    expect(result.current.jobs[0]).not.toHaveProperty('ingredientId');
  });

  it('keeps a failed submission in the requested non-square ratio', async () => {
    mockImagesPost.mockRejectedValue(new Error('Provider unavailable'));
    const { result } = renderStudioGeneration({
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        aspectRatio: '4:5',
      },
    });

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(result.current.jobs[0]).toMatchObject({
      height: 1024,
      width: 816,
    });
  });

  it('refuses to submit without a brand', async () => {
    const { result } = renderStudioGeneration({ brandId: '' });

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(mockNotificationsError).toHaveBeenCalledWith(
      'Please set up a brand before generating',
    );
  });

  it('refuses to submit an empty prompt', async () => {
    const { result } = renderStudioGeneration();
    let isAccepted: boolean | undefined;

    await act(async () => {
      isAccepted = await result.current.submit('   ');
    });

    expect(isAccepted).toBe(false);
    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(mockNotificationsError).toHaveBeenCalledWith('Prompt is required');
  });
});

describe('useStudioGeneration inline voice', () => {
  it('lands a finished card with no socket phase', async () => {
    const { result } = renderStudioGeneration({
      settings: {
        ...getDefaultStudioGenerateSettings('voice'),
        prioritize: RouterPriority.BALANCED,
        voiceId: 'voice-1',
      },
      type: 'voice',
    });

    await act(async () => {
      await result.current.submit('Hello from Genfeed');
    });

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(result.current.jobs[0]).toMatchObject({
      id: 'voi-1',
      ingredientId: 'voi-1',
      ingredient: { id: 'voi-1', cdnUrl: 'https://a/v.mp3' },
      status: IngredientStatus.GENERATED,
      url: 'https://a/v.mp3',
    });
  });
});

describe('Studio generation lifecycle recovery', () => {
  it.each([IngredientStatus.FAILED, IngredientStatus.GENERATED])(
    'refreshes Library for a polled %s result only when it failed without a socket event',
    async (status) => {
      const refreshLibrary = vi.fn();
      const onGenerated = vi.fn();
      const ingredient = {
        id: 'vid-1',
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        status,
      };
      mockVideosFindOne.mockResolvedValue(ingredient);
      window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refreshLibrary);
      const { result, unmount } = renderStudioGeneration({
        type: 'video',
        onGenerated,
      });

      try {
        act(() => {
          result.current.rehydratePending([
            {
              id: ingredient.id,
              ingredientId: ingredient.id,
              createdAt: 1,
              prompt: 'Saved video',
              status: IngredientStatus.PROCESSING,
              type: 'video',
            },
          ]);
        });

        await waitFor(() =>
          expect(result.current.jobs[0]).toMatchObject({ ingredient, status }),
        );
        expect(onGenerated).toHaveBeenCalledOnce();
        expect(refreshLibrary).toHaveBeenCalledTimes(
          status === IngredientStatus.FAILED ? 1 : 0,
        );
        expect(mockVideosPost).not.toHaveBeenCalled();

        act(() => window.dispatchEvent(new Event('focus')));
        expect(refreshLibrary).toHaveBeenCalledTimes(
          status === IngredientStatus.FAILED ? 1 : 0,
        );
      } finally {
        unmount();
        window.removeEventListener(
          LIBRARY_ASSETS_REFRESH_EVENT,
          refreshLibrary,
        );
      }
    },
  );

  it('shows submitting immediately and prevents a duplicate request in the same turn', async () => {
    let finish:
      | ((value: { pendingIngredientIds: string[] }) => void)
      | undefined;
    mockImagesPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderStudioGeneration();
    let request: Promise<boolean> | undefined;
    await act(async () => {
      request = result.current.submit('Portrait');
      void result.current.submit('Portrait');
      await Promise.resolve();
    });
    expect(result.current.jobs[0]).toMatchObject({
      phase: 'submitting',
      prompt: 'Portrait',
    });
    expect(mockImagesPost).toHaveBeenCalledOnce();
    await act(async () => {
      finish?.({ pendingIngredientIds: ['img-1'] });
      await request;
    });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0]?.id).toBe('img-1');
  });

  it('restores a completed result missed while the page was closed', async () => {
    const first = renderStudioGeneration();
    await act(async () => {
      await first.result.current.submit('Portrait');
    });
    first.unmount();
    mockImagesFindOne.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.GENERATED,
      cdnUrl: 'https://a/finished.png',
    });
    const restored = renderStudioGeneration();
    await act(async () => {
      await Promise.resolve();
    });
    expect(restored.result.current.jobs[0]).toMatchObject({
      status: IngredientStatus.GENERATED,
      url: 'https://a/finished.png',
    });
  });

  it('uses the cancellation endpoint and preserves cancellation across refresh', async () => {
    mockCancelGeneration.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.FAILED,
      generationError: 'Cancelled by user',
    });
    const first = renderStudioGeneration();
    await act(async () => {
      await first.result.current.submit('Portrait');
    });
    await act(async () => {
      await first.result.current.cancelJob(first.result.current.jobs[0]);
    });
    expect(mockCancelGeneration).toHaveBeenCalledWith('img-1');
    expect(first.result.current.jobs[0]).toMatchObject({
      phase: 'cancelled',
      status: IngredientStatus.FAILED,
    });
    expect(mockNotificationsError).not.toHaveBeenCalled();
    first.unmount();
    const restored = renderStudioGeneration();
    expect(restored.result.current.jobs[0]?.phase).toBe('cancelled');
  });

  it('does not relabel an already failed job as cancelled', async () => {
    mockCancelGeneration.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.FAILED,
      generationError: 'Provider unavailable',
    });
    const { result } = renderStudioGeneration();
    await act(async () => {
      await result.current.submit('Portrait');
    });
    await act(async () => {
      await result.current.cancelJob(result.current.jobs[0]);
    });
    expect(result.current.jobs[0]?.phase).not.toBe('cancelled');
    expect(result.current.jobs[0]?.error).toBe('Provider unavailable');
  });

  it('ignores a late success after a cancellation event', async () => {
    const captured = captureHandler();
    const { result } = renderStudioGeneration();
    await act(async () => {
      await result.current.submit('Portrait');
    });
    act(() => captured.current?.onFailed('Cancelled by user'));
    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });
    expect(result.current.jobs[0]).toMatchObject({
      phase: 'cancelled',
      status: IngredientStatus.FAILED,
    });
  });
});

describe('authoritative generation completion', () => {
  it('honors a persisted cancellation even when the socket says success', async () => {
    const captured = captureHandler();
    const { result } = renderStudioGeneration();
    await act(async () => {
      await result.current.submit('Portrait');
    });
    mockImagesFindOne.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.FAILED,
      generationError: 'Cancelled by user',
    });
    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });
    expect(result.current.jobs[0]).toMatchObject({
      status: IngredientStatus.FAILED,
      phase: 'cancelled',
    });
  });
});

describe('Crun quote-bound submission', () => {
  const model = 'crun/google/nano-banana-pro';
  const request = {
    model,
    text: 'A product',
    brandId: 'brand-1',
    outputs: 2 as const,
    references: ['ref-1'],
    crunControls: {
      contractVersion: 'reviewed-1',
      aspectRatio: '16:9',
      resolution: '2K' as const,
      outputFormat: 'png' as const,
    },
  };
  const quote = {
    isAvailable: true as const,
    modelKey: model,
    quoteId: 'quote-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    contractVersion: 'reviewed-1',
    credits: 12,
    billingMode: 'credits' as const,
    reasonCode: null,
  };
  function setup() {
    return renderStudioGeneration({
      models: [makeModel(model)],
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        modelKey: model,
        outputs: 2,
      },
    });
  }
  it('posts the canonical quote request once and retains accepted output tracking', async () => {
    const { result } = setup();
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunRequest: request, getCurrentCrunQuote: () => quote },
        ),
      ).toBe(true);
    });
    expect(mockImagesPost).toHaveBeenCalledExactlyOnceWith({
      ...request,
      crunQuoteId: quote.quoteId,
    });
    expect(mockImagesPost.mock.calls[0]?.[0]).not.toHaveProperty('width');
    expect(
      result.current.jobs.some((job) => job.ingredientId === 'img-1'),
    ).toBe(true);
  });
  it('does not send the same quote twice after an accepted request', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.submit(
        request.text,
        {},
        { crunRequest: request, getCurrentCrunQuote: () => quote },
      );
    });
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunRequest: request, getCurrentCrunQuote: () => quote },
        ),
      ).toBe(false);
    });
    expect(mockImagesPost).toHaveBeenCalledTimes(1);
  });
  it('blocks missing or expired quote admission before creating a job', async () => {
    const { result } = setup();
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunRequest: request, getCurrentCrunQuote: () => null },
        ),
      ).toBe(false);
    });
    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(result.current.jobs).toHaveLength(0);
  });
  it('rejects quote invalidation during async service lookup', async () => {
    const { result } = setup();
    const current = vi.fn().mockReturnValueOnce(quote).mockReturnValue(null);
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunRequest: request, getCurrentCrunQuote: current },
        ),
      ).toBe(false);
    });
    expect(mockImagesPost).not.toHaveBeenCalled();
  });
  it('rejects a replacement quote after service lookup rather than consume a different intent', async () => {
    const { result } = setup();
    const current = vi
      .fn()
      .mockReturnValueOnce(quote)
      .mockReturnValue({ ...quote, quoteId: 'quote-2' });
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunRequest: request, getCurrentCrunQuote: current },
        ),
      ).toBe(false);
    });
    expect(mockImagesPost).not.toHaveBeenCalled();
  });
});

describe('canonical quote-bound Crun video submission', () => {
  const model = 'crun/kling/v2-5-turbo-pro' as const;
  const request = {
    model,
    text: 'Motion',
    brandId: 'brand-1',
    outputs: 4 as const,
    references: ['00000000-0000-4000-8000-000000000001'],
    endFrame: '00000000-0000-4000-8000-000000000002',
    crunControls: {
      contractVersion: 'video-v1',
      duration: 10 as const,
      guidanceScale: 0,
    },
  };
  const quote = {
    isAvailable: true as const,
    modelKey: model,
    contractVersion: 'video-v1',
    quoteId: 'video-quote',
    expiresAt: '2099-01-01T00:00:00.000Z',
    credits: 11,
    billingMode: 'credits' as const,
    reasonCode: null,
  };
  function setup() {
    return renderStudioGeneration({
      type: 'video',
      models: [makeModel(model)],
      settings: {
        ...getDefaultStudioGenerateSettings('video'),
        modelKey: model,
        outputs: 4,
      },
    });
  }
  it('posts one canonical body, tracks all accepted IDs and consumes no image endpoint', async () => {
    mockVideosPost.mockResolvedValue({
      id: 'video-1',
      pendingIngredientIds: ['video-1', 'video-2', 'video-3', 'video-4'],
    });
    const { result } = setup();
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          { imageReferenceIds: ['start'], endFrameId: 'end' },
          { crunVideoRequest: request, getCurrentCrunQuote: () => quote },
        ),
      ).toBe(true);
    });
    expect(mockVideosPost).toHaveBeenCalledExactlyOnceWith({
      ...request,
      crunQuoteId: quote.quoteId,
    });
    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(result.current.jobs[0]?.recipe).toMatchObject({
      modelKey: model,
      duration: 10,
      outputs: 4,
      references: request.references,
      endFrameId: request.endFrame,
      crunControls: {
        modelKey: model,
        contractVersion: 'video-v1',
        guidanceScale: 0,
      },
      isAudioEnabled: false,
    });
    expect(result.current.jobs[0]?.recipe?.crunControls).not.toHaveProperty(
      'duration',
    );
    expect(result.current.jobs[0]?.recipe).not.toHaveProperty('crunQuoteId');
    for (const id of ['video-1', 'video-2', 'video-3', 'video-4'])
      expect(mockSubscribe).toHaveBeenCalledWith(
        `/videos/${id}`,
        expect.anything(),
      );
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunVideoRequest: request, getCurrentCrunQuote: () => quote },
        ),
      ).toBe(false);
    });
    expect(mockVideosPost).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed quote after authentication without a fallback', async () => {
    const current = vi.fn().mockReturnValueOnce(quote).mockReturnValue(null);
    const { result } = setup();
    await act(async () => {
      expect(
        await result.current.submit(
          request.text,
          {},
          { crunVideoRequest: request, getCurrentCrunQuote: current },
        ),
      ).toBe(false);
    });
    expect(mockVideosPost).not.toHaveBeenCalled();
    expect(mockImagesPost).not.toHaveBeenCalled();
  });
});

describe('dedicated image editing submission', () => {
  const modelKey = 'ideogram-ai/ideogram-4-5';
  it('sends raw instructions, ordered sources, mask and seed to editing rather than generation', async () => {
    mockImagesEdit.mockResolvedValue({
      pendingIngredientIds: ['edited-1', 'edited-2'],
    });
    const { result } = renderStudioGeneration({
      type: 'image-edit',
      models: [makeModel(modelKey)],
      settings: {
        ...getDefaultStudioGenerateSettings('image-edit'),
        modelKey,
        outputs: 2,
        editSize: '1536x640',
        editSeed: 0,
        brandingMode: 'brand',
        style: 'cinematic',
      },
    });
    await act(async () => {
      expect(
        await result.current.submit('Change only the sign', {
          editSourceIds: ['source-1', 'source-2'],
          editMaskId: 'mask-1',
        }),
      ).toBe(true);
    });
    expect(mockImagesEdit).toHaveBeenCalledWith(
      'source-1',
      expect.objectContaining({
        prompt: 'Change only the sign',
        references: ['source-2'],
        maskId: 'mask-1',
        size: 'source',
        outputs: 2,
        seed: 0,
        model: modelKey,
        brand: 'brand-1',
      }),
    );
    expect(mockImagesPost).not.toHaveBeenCalled();
    const payload = mockImagesEdit.mock.calls[0][1];
    expect(payload).not.toHaveProperty('style');
    expect(payload).not.toHaveProperty('harness');
    expect(result.current.jobs).toHaveLength(2);
    expect(result.current.jobs[0].recipe?.imageEdit?.sourceIds).toEqual([
      'source-1',
      'source-2',
    ]);
  });
  it('blocks a missing source or unavailable explicit editing model without substituting a generation model', async () => {
    const { result } = renderStudioGeneration({
      type: 'image-edit',
      models: [makeModel(modelKey)],
      settings: {
        ...getDefaultStudioGenerateSettings('image-edit'),
        modelKey: 'flux-dev',
      },
    });
    await act(async () => {
      expect(
        await result.current.submit('Change the sign', {
          editSourceIds: ['source'],
        }),
      ).toBe(false);
    });
    expect(mockImagesEdit).not.toHaveBeenCalled();
    expect(mockImagesPost).not.toHaveBeenCalled();
  });
});

describe('FLUX.3 submission and reusable native recipe', () => {
  it('posts native resolution/aspect ratio with ten ordered sources and no unsupported controls', async () => {
    const modelKey = 'black-forest-labs/flux-3-image-edit';
    mockImagesEdit.mockResolvedValue({ pendingIngredientIds: ['flux-edit'] });
    const { result } = renderStudioGeneration({
      type: 'image-edit',
      models: [makeModel(modelKey)],
      settings: {
        ...getDefaultStudioGenerateSettings('image-edit'),
        modelKey,
        resolution: '2k',
        aspectRatio: 'auto',
      },
    });
    const sources = Array.from({ length: 10 }, (_, i) => `source-${i}`);
    await act(async () => {
      expect(
        await result.current.submit('Change only the sign', {
          editSourceIds: sources,
        }),
      ).toBe(true);
    });
    const [primary, payload] = mockImagesEdit.mock.calls[0];
    expect(primary).toBe('source-0');
    expect(payload).toMatchObject({
      model: modelKey,
      resolution: '2k',
      aspectRatio: 'auto',
      outputs: 1,
      references: sources.slice(1),
    });
    for (const field of ['size', 'quality', 'maskId', 'seed'])
      expect(payload).not.toHaveProperty(field);
    expect(result.current.jobs[0].recipe?.imageEdit).toMatchObject({
      sourceIds: sources,
      resolution: '2k',
      aspectRatio: 'auto',
      grounding: false,
      outputs: 1,
    });
  });
  it('passes native resolution and aspect ratio on ordinary generation', async () => {
    const modelKey = 'black-forest-labs/flux-3-image';
    mockImagesPost.mockResolvedValue({ pendingIngredientIds: ['flux-gen'] });
    const { result } = renderStudioGeneration({
      type: 'image',
      models: [makeModel(modelKey)],
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        modelKey,
        resolution: '4k',
        aspectRatio: '21:9',
      },
    });
    await act(async () => {
      expect(await result.current.submit('A landscape', {})).toBe(true);
    });
    expect(mockImagesPost).toHaveBeenCalledWith(
      expect.objectContaining({
        model: modelKey,
        resolution: '4k',
        aspectRatio: '21:9',
        outputs: 1,
      }),
    );
  });
});

describe('persisted video submission reconciliation', () => {
  it('hydrates a server-owned FAILED row once and refreshes both surfaces without synthetic duplication', async () => {
    const onGenerated = vi.fn();
    const refreshEvent = vi.fn();
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refreshEvent);
    const ingredient = {
      id: 'saved-video',
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      status: IngredientStatus.FAILED,
    } as IIngredient;
    mockVideosPost.mockRejectedValue({
      errors: [
        {
          detail: 'Submission failed',
          meta: { persistedVideoIngredientIds: ['saved-video'] },
        },
      ],
    });
    mockVideosFindOne.mockResolvedValue(ingredient);
    const { result } = renderStudioGeneration({ type: 'video', onGenerated });
    await act(async () => {
      expect(await result.current.submit('Saved prompt')).toBe(false);
    });
    expect(mockVideosFindOne).toHaveBeenCalledWith('saved-video', {
      brandId: 'brand-1',
    });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0]).toMatchObject({
      id: ingredient.id,
      ingredientId: ingredient.id,
      ingredient,
      recipe: { text: 'Saved prompt' },
      status: IngredientStatus.FAILED,
    });
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(refreshEvent).toHaveBeenCalledTimes(1);
    expect(mockVideosPost).toHaveBeenCalledTimes(1);
    window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refreshEvent);
  });
});

function persistedVideoFailure(ids: unknown) {
  return {
    errors: [
      {
        detail: 'Failed submission',
        meta: { persistedVideoIngredientIds: ids },
      },
    ],
  };
}
function persistedVideo(
  id: string,
  status = IngredientStatus.FAILED,
): IIngredient {
  return {
    id,
    brandId: 'brand-1',
    category: IngredientCategory.VIDEO,
    status,
  } as IIngredient;
}
function deferredVideo() {
  let resolve: (value: IIngredient | null) => void = () => {
    throw new Error('Deferred read not initialized');
  };
  const promise = new Promise<IIngredient | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('collect-first persisted video hydration', () => {
  it('publishes nothing until sequential initial reads finish and never polls refused IDs', async () => {
    const first = deferredVideo();
    const second = deferredVideo();
    mockVideosPost.mockRejectedValue(
      persistedVideoFailure(['ready', 'refused']),
    );
    mockVideosFindOne.mockImplementation((id: string) =>
      id === 'ready' ? first.promise : second.promise,
    );
    const { result } = renderStudioGeneration({ type: 'video' });
    let submission = Promise.resolve(false);
    act(() => {
      submission = result.current.submit('Saved prompt');
    });
    await waitFor(() => expect(mockVideosFindOne).toHaveBeenCalledTimes(1));
    expect(
      result.current.jobs.every(
        (job) => job.phase === 'submitting' && !job.ingredientId,
      ),
    ).toBe(true);
    expect(mockSubscribe).not.toHaveBeenCalled();
    await act(async () => {
      first.resolve(persistedVideo('ready'));
    });
    expect(mockVideosFindOne).toHaveBeenCalledTimes(2);
    expect(
      result.current.jobs.every(
        (job) => job.phase === 'submitting' && !job.ingredientId,
      ),
    ).toBe(true);
    expect(mockSubscribe).not.toHaveBeenCalled();
    await act(async () => {
      second.resolve(null);
      await submission;
    });
    expect(result.current.jobs.map((job) => job.id)).toEqual(['ready']);
    expect(mockVideosFindOne.mock.calls).toEqual([
      ['ready', { brandId: 'brand-1' }],
      ['refused', { brandId: 'brand-1' }],
    ]);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
  it('atomically keeps mixed terminal/pending/transient outcomes and discards refusal without POST replay', async () => {
    mockVideosPost.mockRejectedValue(
      persistedVideoFailure(['failed', 'pending', 'transient', 'forbidden']),
    );
    mockVideosFindOne.mockImplementation(
      async (id: string, scope?: { brandId: string }) => {
        if (!scope) return persistedVideo(id, IngredientStatus.PROCESSING);
        if (id === 'forbidden') throw { errors: [{ status: '403' }] };
        if (id === 'transient') throw new Error('Transport unavailable');
        return persistedVideo(
          id,
          id === 'pending'
            ? IngredientStatus.PROCESSING
            : IngredientStatus.FAILED,
        );
      },
    );
    const { result } = renderStudioGeneration({ type: 'video' });
    await act(async () => {
      await result.current.submit('Saved prompt');
    });
    expect(result.current.jobs).toHaveLength(3);
    const failed = result.current.jobs.find((job) => job.id === 'failed');
    const pending = result.current.jobs.find((job) => job.id === 'pending');
    const transient = result.current.jobs.find((job) => job.id === 'transient');
    expect(failed?.status).toBe(IngredientStatus.FAILED);
    expect(pending?.status).toBe(IngredientStatus.PROCESSING);
    expect(transient).toMatchObject({
      ingredientId: 'transient',
      status: IngredientStatus.PROCESSING,
      error: 'The result could not be loaded. Reconnecting…',
    });
    expect(transient?.ingredient).toBeUndefined();
    expect(new Set(result.current.jobs.map((job) => job.runId)).size).toBe(1);
    expect(
      mockVideosFindOne.mock.calls.filter((call) => call[1]?.brandId),
    ).toEqual(
      ['failed', 'pending', 'transient', 'forbidden'].map((id) => [
        id,
        { brandId: 'brand-1' },
      ]),
    );
    expect(
      mockVideosFindOne.mock.calls
        .filter((call) => !call[1]?.brandId)
        .every((call) => ['pending', 'transient'].includes(call[0])),
    ).toBe(true);
    expect(mockSubscribe.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/videos/pending',
      '/videos/transient',
    ]);
    expect(mockVideosPost).toHaveBeenCalledTimes(1);
  });
  it.each([
    'missing',
    'forbidden',
    'brand',
    'id',
    'category',
    'deleted',
    'status',
  ])('refuses %s identity before publication or subscription', async (kind) => {
    mockVideosPost.mockRejectedValue(persistedVideoFailure(['saved']));
    const row = persistedVideo('saved');
    if (kind === 'missing') mockVideosFindOne.mockResolvedValue(null);
    else if (kind === 'forbidden')
      mockVideosFindOne.mockRejectedValue({ response: { status: 403 } });
    else
      mockVideosFindOne.mockResolvedValue({
        ...row,
        ...(kind === 'brand'
          ? { brandId: 'foreign' }
          : kind === 'id'
            ? { id: 'other' }
            : kind === 'category'
              ? { category: IngredientCategory.IMAGE }
              : kind === 'deleted'
                ? { isDeleted: true }
                : { status: 'INVALID' }),
      });
    const { result } = renderStudioGeneration({ type: 'video' });
    await act(async () => {
      await result.current.submit('Saved');
    });
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].id).toMatch(/^failed-/);
    expect(result.current.jobs[0].ingredientId).toBeUndefined();
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockVideosFindOne).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, [], ['saved', 'saved'], ['bad ']])(
    'keeps malformed/pre-placeholder errors local and refreshes Library (%j)',
    async (ids) => {
      mockVideosPost.mockRejectedValue(persistedVideoFailure(ids));
      const refresh = vi.fn();
      const { result } = renderStudioGeneration({
        type: 'video',
        onGenerated: refresh,
      });
      await act(async () => {
        await result.current.submit('Saved');
      });
      expect(result.current.jobs[0].id).toMatch(/^failed-/);
      expect(mockVideosFindOne).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    },
  );
  it('stops remaining hydration and refresh after a brand switch during an awaited read', async () => {
    const read = deferredVideo();
    mockVideosPost.mockRejectedValue(
      persistedVideoFailure(['saved', 'second']),
    );
    mockVideosFindOne.mockReturnValue(read.promise);
    const onGenerated = vi.fn();
    const { result, rerender } = renderHook(
      ({ brandId }) =>
        useStudioGeneration({
          brandId,
          type: 'video',
          models: [],
          settings: getDefaultStudioGenerateSettings('video'),
          onGenerated,
        }),
      { initialProps: { brandId: 'brand-1' } },
    );
    let submission = Promise.resolve(false);
    act(() => {
      submission = result.current.submit('Saved');
    });
    await waitFor(() => expect(mockVideosFindOne).toHaveBeenCalledOnce());
    rerender({ brandId: 'brand-2' });
    await act(async () => {
      read.resolve(persistedVideo('saved'));
      await submission;
    });
    expect(result.current.jobs).toEqual([]);
    expect(mockVideosFindOne).toHaveBeenCalledOnce();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
