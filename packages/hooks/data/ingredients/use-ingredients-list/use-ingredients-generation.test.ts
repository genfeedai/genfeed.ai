import { IngredientFormat, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useIngredientsGeneration } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-generation';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenModal, mockServicePost } = vi.hoisted(() => ({
  mockOpenModal: vi.fn(),
  mockServicePost: vi.fn(),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: vi.fn(() => ({
    availableTags: [],
    blacklists: [],
    cameras: [],
    fontFamilies: [],
    moods: [],
    presets: [],
    sounds: [],
    styles: [],
    tags: [{ id: 'tag-1', key: 'travel', label: 'Travel' }],
    videoModels: [{ key: 'model-1' }],
  })),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: (...args: unknown[]) => mockOpenModal(...args),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockImplementation(async () => ({ post: mockServicePost })),
  ),
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function createIngredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    id: 'img-1',
    ingredientFormat: IngredientFormat.PORTRAIT,
    promptText: 'A sunny beach',
    status: IngredientStatus.VALIDATED,
    ...overrides,
  } as unknown as IIngredient;
}

describe('useIngredientsGeneration', () => {
  const mockNotificationsService = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  };
  const mockFindAll = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    findAllIngredientsByCategory: mockFindAll,
    notificationsService: mockNotificationsService as never,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServicePost.mockResolvedValue({ id: 'video-1' });
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));
    expect(result.current).toHaveProperty('videoModels');
    expect(result.current).toHaveProperty('cameras');
    expect(result.current).toHaveProperty('moods');
    expect(result.current).toHaveProperty('styles');
    expect(result.current).toHaveProperty('sounds');
    expect(result.current).toHaveProperty('presets');
    expect(result.current).toHaveProperty('blacklists');
    expect(result.current).toHaveProperty('fontFamilies');
    expect(result.current).toHaveProperty('availableTags');
    expect(result.current).toHaveProperty('handleConvertToVideo');
    expect(result.current).toHaveProperty('imageToVideoTarget');
    expect(result.current).toHaveProperty('isImageToVideoGenerating');
    expect(result.current).toHaveProperty('imageToVideoPromptData');
    expect(result.current).toHaveProperty('handleCloseImageToVideoModal');
    expect(result.current.imageToVideoTarget).toBeNull();
    expect(result.current.isImageToVideoGenerating).toBe(false);
    expect(result.current.videoModels).toHaveLength(1);
  });

  it('prepares the image-to-video modal with prompt defaults', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));
    const ingredient = createIngredient();

    act(() => {
      result.current.handleConvertToVideo(ingredient);
    });

    expect(result.current.imageToVideoTarget).toEqual(ingredient);
    expect(result.current.imageToVideoPromptData).toEqual(
      expect.objectContaining({
        format: IngredientFormat.PORTRAIT,
        height: 1920,
        isValid: true,
        models: ['model-1'],
        references: ['img-1'],
        text: 'A sunny beach',
        width: 1080,
      }),
    );
    expect(mockOpenModal).toHaveBeenCalled();
  });

  it('blocks conversion while the image is still processing', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(
        createIngredient({ status: IngredientStatus.PROCESSING }),
      );
    });

    expect(mockNotificationsService.info).toHaveBeenCalledWith(
      'Please wait until the image has finished processing',
    );
    expect(result.current.imageToVideoTarget).toBeNull();
  });

  it('keeps the source image in the prompt references on change', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(createIngredient());
    });

    act(() => {
      result.current.handleImageToVideoPromptChange({
        isValid: true,
        references: ['other-ref'],
      });
    });

    expect(result.current.imageToVideoPromptData.references).toEqual([
      'img-1',
      'other-ref',
    ]);
  });

  it('submits a generation payload per selected model', async () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(createIngredient());
    });

    await act(async () => {
      await result.current.handleImageToVideoSubmit({
        isValid: true,
        models: ['model-a', 'model-b'],
        tags: ['travel'],
        text: 'Turn into video',
      } as never);
    });

    expect(mockServicePost).toHaveBeenCalledTimes(2);
    expect(mockServicePost).toHaveBeenCalledWith(
      expect.objectContaining({
        format: IngredientFormat.PORTRAIT,
        model: 'model-a',
        parent: 'img-1',
        references: ['img-1'],
        tags: [{ id: 'tag-1', key: 'travel', label: 'Travel' }],
        text: 'Turn into video',
        type: 'image-to-video',
      }),
    );
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Video generation started',
    );
    expect(mockFindAll).toHaveBeenCalledWith(true);
    expect(result.current.imageToVideoTarget).toBeNull();
    expect(result.current.isImageToVideoGenerating).toBe(false);
  });

  it('ignores submit without a target', async () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    await act(async () => {
      await result.current.handleImageToVideoSubmit({
        isValid: true,
        text: 'no target',
      } as never);
    });

    expect(mockServicePost).not.toHaveBeenCalled();
  });

  it('requires a prompt before generating', async () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(createIngredient());
    });

    await act(async () => {
      await result.current.handleImageToVideoSubmit({
        isValid: false,
        text: '   ',
      } as never);
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'A prompt is required to generate a video',
    );
    expect(mockServicePost).not.toHaveBeenCalled();
  });

  it('surfaces generation failures with the error message', async () => {
    mockServicePost.mockRejectedValue(new Error('Model overloaded'));
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(createIngredient());
    });

    await act(async () => {
      await result.current.handleImageToVideoSubmit({
        isValid: true,
        text: 'Turn into video',
      } as never);
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Model overloaded',
    );
    expect(result.current.isImageToVideoGenerating).toBe(false);
    // Target remains for retry after a failure
    expect(result.current.imageToVideoTarget).not.toBeNull();
  });

  it('resets modal state on close', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));

    act(() => {
      result.current.handleConvertToVideo(createIngredient());
    });
    expect(result.current.imageToVideoTarget).not.toBeNull();

    act(() => {
      result.current.handleCloseImageToVideoModal();
    });

    expect(result.current.imageToVideoTarget).toBeNull();
    expect(result.current.imageToVideoPromptData).toEqual({
      isValid: false,
      text: '',
    });
    expect(result.current.isImageToVideoGenerating).toBe(false);
  });
});
