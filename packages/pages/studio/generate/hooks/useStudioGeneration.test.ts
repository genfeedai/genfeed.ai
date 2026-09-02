import { IngredientStatus, RouterPriority } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockImagesFindOne = vi.fn();
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({ findOne: mockImagesFindOne, post: mockImagesPost }),
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
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ findOne: mockIngredientsFindOne }),
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
  mockVoicesGenerate.mockResolvedValue({ id: 'voi-1', url: 'https://a/v.mp3' });
  mockImagesFindOne.mockResolvedValue({ id: 'img-1', url: 'https://a/i.png' });
  mockVideosFindOne.mockResolvedValue({ id: 'vid-1', url: 'https://a/v.mp4' });
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
    };
    mockImagesFindOne.mockResolvedValueOnce(ingredient);
    const captured = captureHandler();
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });

    expect(mockImagesFindOne).toHaveBeenCalledWith('img-1');
    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.GENERATED);
    expect(result.current.jobs[0]?.url).toBe('https://a/i.png');
    expect(result.current.jobs[0]?.ingredient).toBe(ingredient);
  });

  it('fails the card when the finished asset cannot be read', async () => {
    // A generated card with no media is a lie — fail it loudly instead.
    mockImagesFindOne.mockRejectedValue(new Error('403'));
    const captured = captureHandler();
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

    await act(async () => {
      await captured.current?.onSuccess({ id: 'img-1' });
    });

    expect(result.current.jobs[0]?.status).toBe(IngredientStatus.FAILED);
    expect(result.current.jobs[0]?.error).toContain('could not be loaded');
  });

  it('fails the card and toasts when the socket reports an error', async () => {
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

  it('refuses to submit without a chosen portrait', async () => {
    const { result } = renderStudioGeneration({
      settings: { ...avatarSettings, avatarPhotoUrl: undefined },
      type: 'avatar',
    });

    await act(async () => {
      await result.current.submit('Hello from Genfeed');
    });

    expect(mockHeyGenGenerate).not.toHaveBeenCalled();
    expect(mockNotificationsError).toHaveBeenCalledWith(
      'Pick an avatar before generating',
    );
  });
});

describe('useStudioGeneration failures', () => {
  it('leaves a failed card behind when the submit itself throws', async () => {
    // A toast disappears; the operator still needs to reprompt without
    // retyping the prompt.
    mockImagesPost.mockRejectedValue(new Error('Insufficient credits'));
    const { result } = renderStudioGeneration();

    await act(async () => {
      await result.current.submit('A founder at a desk');
    });

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

    await act(async () => {
      await result.current.submit('   ');
    });

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
      ingredient: { id: 'voi-1', url: 'https://a/v.mp3' },
      status: IngredientStatus.GENERATED,
      url: 'https://a/v.mp3',
    });
  });
});
