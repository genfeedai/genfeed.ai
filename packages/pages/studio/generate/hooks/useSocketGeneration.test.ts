// @vitest-environment jsdom

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  ModelCategory,
  ModelProvider,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { useSocketGeneration } from '@pages/studio/generate/hooks/useSocketGeneration';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MediaHandler {
  onFailed: (error: string) => void;
  onSuccess: (result: unknown) => Promise<void>;
}

const mocks = vi.hoisted(() => ({
  addToGenerationQueue: vi.fn(),
  handlers: new Map<string, MediaHandler>(),
  heyGenGenerate: vi.fn(),
  imageFindOne: vi.fn(),
  imagePost: vi.fn(),
  ingredientsFindOne: vi.fn(),
  musicFindOne: vi.fn(),
  musicPost: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  updateGenerationStatus: vi.fn(),
  videoFindOne: vi.fn(),
  videoPost: vi.fn(),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({
    addToGenerationQueue: mocks.addToGenerationQueue,
    updateGenerationStatus: mocks.updateGenerationStatus,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    return async () => factory('test-token');
  },
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: mocks.subscribe,
  }),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      findOne: mocks.ingredientsFindOne,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: (
    onSuccess: (result: unknown) => Promise<void>,
    onFailed: (error: string) => void,
  ): MediaHandler => ({
    onFailed,
    onSuccess,
  }),
}));

vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({
      generate: mocks.heyGenGenerate,
    }),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      findOne: mocks.imageFindOne,
      post: mocks.imagePost,
    }),
  },
}));

vi.mock('@services/ingredients/musics.service', () => ({
  MusicsService: {
    getInstance: () => ({
      findOne: mocks.musicFindOne,
      post: mocks.musicPost,
    }),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({
      findOne: mocks.videoFindOne,
      post: mocks.videoPost,
    }),
  },
}));

function createModel(
  category: ModelCategory,
  key: string,
  isDefault = false,
): IModel {
  return {
    category,
    cost: 1,
    createdAt: '2026-07-23T00:00:00.000Z',
    id: `model-${key}`,
    isActive: true,
    isDefault,
    isDeleted: false,
    key,
    label: key,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-07-23T00:00:00.000Z',
  };
}

function createPrompt(
  category: IngredientCategory,
  modelKey?: string,
): PromptTextareaSchema & { isValid: boolean } {
  return {
    avatarId: category === IngredientCategory.AVATAR ? 'avatar-1' : undefined,
    blacklist: [],
    brand: 'brand-1',
    category,
    fontFamily: '',
    format: IngredientFormat.PORTRAIT,
    height: 1920,
    isValid: true,
    models: modelKey ? [modelKey] : [],
    outputs: 1,
    quality: 'premium',
    sounds: [],
    speech:
      category === IngredientCategory.AVATAR
        ? 'A product update from the team'
        : undefined,
    style: '',
    tags: [],
    text: `Create a ${category} asset`,
    voiceId: category === IngredientCategory.AVATAR ? 'voice-1' : undefined,
    width: 1080,
  };
}

function getModelCategory(category: IngredientCategory): ModelCategory {
  switch (category) {
    case IngredientCategory.IMAGE:
      return ModelCategory.IMAGE;
    case IngredientCategory.MUSIC:
      return ModelCategory.MUSIC;
    default:
      return ModelCategory.VIDEO;
  }
}

function getCreateMock(category: IngredientCategory) {
  switch (category) {
    case IngredientCategory.AVATAR:
      return mocks.heyGenGenerate;
    case IngredientCategory.IMAGE:
      return mocks.imagePost;
    case IngredientCategory.MUSIC:
      return mocks.musicPost;
    default:
      return mocks.videoPost;
  }
}

function getFindOneMock(category: IngredientCategory) {
  switch (category) {
    case IngredientCategory.AVATAR:
      return mocks.ingredientsFindOne;
    case IngredientCategory.IMAGE:
      return mocks.imageFindOne;
    case IngredientCategory.MUSIC:
      return mocks.musicFindOne;
    default:
      return mocks.videoFindOne;
  }
}

describe('useSocketGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.subscribe.mockImplementation(
      (path: string, handler: MediaHandler) => {
        mocks.handlers.set(path, handler);
        return mocks.unsubscribe;
      },
    );
  });

  it.each([
    IngredientCategory.IMAGE,
    IngredientCategory.VIDEO,
    IngredientCategory.MUSIC,
    IngredientCategory.AVATAR,
  ])('runs the healthy %s lifecycle from selected provider to completed asset', async (category) => {
    const selectedModelKey =
      category === IngredientCategory.AVATAR
        ? undefined
        : `${category}-selected`;
    const currentModels = selectedModelKey
      ? [
          createModel(getModelCategory(category), `${category}-fallback`, true),
          createModel(getModelCategory(category), selectedModelKey),
        ]
      : [];
    const pendingId = `${category}-pending`;
    const completedId = `${category}-completed`;
    const createMock = getCreateMock(category);
    const findOneMock = getFindOneMock(category);
    const findAllAssets = vi.fn().mockResolvedValue(undefined);
    const setGeneratedAssetId = vi.fn();

    createMock.mockResolvedValue({ id: pendingId });
    findOneMock.mockResolvedValue({ id: completedId });

    const { result } = renderHook(() =>
      useSocketGeneration({
        brandId: 'brand-1',
        categoryType: category,
        currentModels,
        findAllAssets,
        setGeneratedAssetId,
      }),
    );

    await act(async () => {
      await result.current.handleGenerateSubmit(
        createPrompt(category, selectedModelKey),
      );
    });

    if (category === IngredientCategory.AVATAR) {
      expect(mocks.heyGenGenerate).toHaveBeenCalledWith({
        avatarId: 'avatar-1',
        speech: 'A product update from the team',
        text: 'Create a avatar asset',
        voiceId: 'voice-1',
      });
    } else {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: selectedModelKey,
          text: `Create a ${category} asset`,
        }),
      );
    }

    expect(setGeneratedAssetId).toHaveBeenCalledWith(pendingId);
    expect(mocks.addToGenerationQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pendingId,
        prompt: `Create a ${category} asset`,
        status: [IngredientStatus.PROCESSING],
        type: category,
      }),
    );

    const subscriptionPath = `/${category}s/${pendingId}`;
    expect(mocks.subscribe).toHaveBeenCalledWith(
      subscriptionPath,
      expect.any(Object),
    );
    expect(findAllAssets).toHaveBeenCalledTimes(1);

    const handler = mocks.handlers.get(subscriptionPath);
    expect(handler).toBeDefined();

    await act(async () => {
      await handler?.onSuccess({ id: completedId });
    });

    expect(findOneMock).toHaveBeenCalledWith(completedId);
    expect(mocks.updateGenerationStatus).toHaveBeenCalledWith(
      pendingId,
      expect.objectContaining({
        currentPhase: 'Completed',
        remainingDurationMs: 0,
        resultId: completedId,
        status: [IngredientStatus.GENERATED],
      }),
    );
    expect(findAllAssets).toHaveBeenCalledTimes(2);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('uses the first compatible model when the composer has no explicit model override', async () => {
    const findAllAssets = vi.fn().mockResolvedValue(undefined);
    const firstModel = createModel(ModelCategory.IMAGE, 'image-default', true);
    mocks.imagePost.mockResolvedValue({ id: 'image-pending' });

    const { result } = renderHook(() =>
      useSocketGeneration({
        brandId: 'brand-1',
        categoryType: IngredientCategory.IMAGE,
        currentModels: [
          firstModel,
          createModel(ModelCategory.IMAGE, 'image-secondary'),
        ],
        findAllAssets,
        setGeneratedAssetId: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleGenerateSubmit(
        createPrompt(IngredientCategory.IMAGE),
      );
    });

    expect(mocks.imagePost).toHaveBeenCalledWith(
      expect.objectContaining({
        model: firstModel.key,
      }),
    );
  });
});
