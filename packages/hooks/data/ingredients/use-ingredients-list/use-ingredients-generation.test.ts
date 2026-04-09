import { useIngredientsGeneration } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-generation';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    tags: [],
    videoModels: [{ key: 'model-1' }],
  })),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: vi.fn(),
  },
}));

describe('useIngredientsGeneration', () => {
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const mockFindAll = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    findAllIngredientsByCategory: mockFindAll,
    notificationsService: mockNotificationsService as never,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('initializes imageToVideoTarget as null', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));
    expect(result.current.imageToVideoTarget).toBeNull();
  });

  it('initializes isImageToVideoGenerating as false', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));
    expect(result.current.isImageToVideoGenerating).toBe(false);
  });

  it('videoModels returns array from useElements', () => {
    const { result } = renderHook(() => useIngredientsGeneration(baseProps));
    expect(result.current.videoModels).toHaveLength(1);
  });
});
