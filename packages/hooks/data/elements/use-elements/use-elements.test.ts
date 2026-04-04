import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn() })),
}));

vi.mock('@providers/elements/elements.provider', () => ({
  useElementsContext: vi.fn(() => ({
    blacklists: [],
    cameraMovements: [],
    cameras: [],
    fontFamilies: [],
    isLoading: false,
    isRefreshing: false,
    lenses: [],
    lightings: [],
    models: [],
    moods: [],
    presets: [],
    scenes: [],
    sounds: [],
    styles: [],
    tags: [],
    trainings: [],
  })),
}));

vi.mock('@providers/promptbar/promptbar.provider', () => ({
  usePromptBarContext: vi.fn(() => ({
    isLoading: false,
    models: [],
    tags: [],
    trainings: [],
  })),
}));

describe('useElements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cameras, moods, and other element arrays', () => {
    const { result } = renderHook(() => useElements());

    expect(result.current).toHaveProperty('cameras');
    expect(result.current).toHaveProperty('moods');
    expect(result.current).toHaveProperty('styles');
    expect(result.current).toHaveProperty('sounds');
    expect(result.current).toHaveProperty('presets');
    expect(result.current).toHaveProperty('tags');
    expect(result.current).toHaveProperty('blacklists');
  });

  it('returns isLoading as false when providers are not loading', () => {
    const { result } = renderHook(() => useElements());
    expect(result.current.isLoading).toBe(false);
  });

  it('returns filter and setFilter', () => {
    const { result } = renderHook(() => useElements());
    expect(result.current).toHaveProperty('filter');
    expect(result.current).toHaveProperty('setFilter');
    expect(typeof result.current.setFilter).toBe('function');
  });

  it('returns filtered arrays', () => {
    const { result } = renderHook(() => useElements());
    expect(result.current).toHaveProperty('filteredCameras');
    expect(result.current).toHaveProperty('filteredMoods');
    expect(result.current).toHaveProperty('filteredStyles');
    expect(Array.isArray(result.current.filteredCameras)).toBe(true);
  });
});
