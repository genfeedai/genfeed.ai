import { IngredientCategory, ModelCategory } from '@genfeedai/enums';
import { usePromptBarFilters } from '@hooks/prompt-bar/use-prompt-bar-filters/use-prompt-bar-filters';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const createMockStyle = (overrides = {}) => ({
  category: null,
  id: 'style-1',
  models: [],
  name: 'Test Style',
  ...overrides,
});

const createMockMood = (overrides = {}) => ({
  category: null,
  id: 'mood-1',
  name: 'Test Mood',
  ...overrides,
});

const createMockCamera = (overrides = {}) => ({
  category: null,
  id: 'camera-1',
  name: 'Test Camera',
  ...overrides,
});

const createMockPreset = (overrides = {}) => ({
  category: null,
  id: 'preset-1',
  name: 'Test Preset',
  platform: null,
  ...overrides,
});

const createMockBlacklist = (overrides = {}) => ({
  category: ModelCategory.VIDEO,
  id: 'blacklist-1',
  name: 'Test Blacklist',
  ...overrides,
});

const createMockSound = (overrides = {}) => ({
  category: IngredientCategory.VIDEO,
  id: 'sound-1',
  isActive: true,
  name: 'Test Sound',
  ...overrides,
});

const baseOptions = {
  blacklists: [],
  cameraMovements: [],
  cameras: [],
  currentModelCategory: null,
  fontFamilies: [],
  lenses: [],
  lightings: [],
  moods: [],
  normalizedWatchedModels: [],
  presets: [],
  scenes: [],
  sounds: [],
  styles: [],
};

describe('usePromptBarFilters', () => {
  describe('Initial State', () => {
    it('returns all arrays when no filters are applied', () => {
      const styles = [createMockStyle()];
      const moods = [createMockMood()];

      const { result } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, moods, styles }),
      );

      expect(result.current.filteredStyles).toEqual(styles);
      expect(result.current.filteredMoods).toEqual(moods);
    });

    it('returns empty arrays when inputs are empty', () => {
      const { result } = renderHook(() => usePromptBarFilters(baseOptions));

      expect(result.current.filteredStyles).toEqual([]);
      expect(result.current.filteredMoods).toEqual([]);
      expect(result.current.filteredCameras).toEqual([]);
      expect(result.current.filteredScenes).toEqual([]);
      expect(result.current.filteredLightings).toEqual([]);
      expect(result.current.filteredLenses).toEqual([]);
      expect(result.current.filteredCameraMovements).toEqual([]);
      expect(result.current.filteredFontFamilies).toEqual([]);
      expect(result.current.filteredPresets).toEqual([]);
      expect(result.current.filteredBlacklists).toEqual([]);
      expect(result.current.filteredSounds).toEqual([]);
    });
  });

  describe('Style Filtering', () => {
    it('filters styles by model category', () => {
      const styles = [
        createMockStyle({ category: ModelCategory.VIDEO, id: '1' }),
        createMockStyle({ category: ModelCategory.IMAGE, id: '2' }),
        createMockStyle({ category: null, id: '3' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          styles,
        }),
      );

      expect(result.current.filteredStyles).toHaveLength(2);
      expect(result.current.filteredStyles.map((s) => s.id)).toContain('1');
      expect(result.current.filteredStyles.map((s) => s.id)).toContain('3');
    });

    it('filters styles by model keys when provided', () => {
      const styles = [
        createMockStyle({ id: '1', models: ['model-a', 'model-b'] }),
        createMockStyle({ id: '2', models: ['model-c'] }),
        createMockStyle({ id: '3', models: [] }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          normalizedWatchedModels: ['model-a'],
          styles,
        }),
      );

      expect(result.current.filteredStyles).toHaveLength(2);
      expect(result.current.filteredStyles.map((s) => s.id)).toContain('1');
      expect(result.current.filteredStyles.map((s) => s.id)).toContain('3');
    });

    it('includes styles without category or models when no filters match', () => {
      const styles = [
        createMockStyle({ category: null, id: '1', models: [] }),
        createMockStyle({ category: ModelCategory.IMAGE, id: '2', models: [] }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          styles,
        }),
      );

      expect(result.current.filteredStyles).toHaveLength(1);
      expect(result.current.filteredStyles[0].id).toBe('1');
    });
  });

  describe('Mood Filtering', () => {
    it('filters moods by model category', () => {
      const moods = [
        createMockMood({ category: ModelCategory.VIDEO, id: '1' }),
        createMockMood({ category: ModelCategory.IMAGE, id: '2' }),
        createMockMood({ category: null, id: '3' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          moods,
        }),
      );

      expect(result.current.filteredMoods).toHaveLength(2);
    });

    it('returns all moods when no category filter', () => {
      const moods = [
        createMockMood({ category: ModelCategory.VIDEO, id: '1' }),
        createMockMood({ category: null, id: '2' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, moods }),
      );

      expect(result.current.filteredMoods).toEqual(moods);
    });
  });

  describe('Camera Filtering', () => {
    it('filters cameras by model category', () => {
      const cameras = [
        createMockCamera({ category: ModelCategory.VIDEO, id: '1' }),
        createMockCamera({ category: ModelCategory.IMAGE, id: '2' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          cameras,
          currentModelCategory: ModelCategory.VIDEO,
        }),
      );

      expect(result.current.filteredCameras).toHaveLength(1);
      expect(result.current.filteredCameras[0].id).toBe('1');
    });
  });

  describe('Preset Filtering', () => {
    it('includes presets with platform regardless of category', () => {
      const presets = [
        createMockPreset({
          category: ModelCategory.IMAGE,
          id: '1',
          platform: 'instagram',
        }),
        createMockPreset({
          category: ModelCategory.IMAGE,
          id: '2',
          platform: null,
        }),
        createMockPreset({
          category: ModelCategory.VIDEO,
          id: '3',
          platform: null,
        }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          presets,
        }),
      );

      expect(result.current.filteredPresets).toHaveLength(2);
      expect(result.current.filteredPresets.map((p) => p.id)).toContain('1');
      expect(result.current.filteredPresets.map((p) => p.id)).toContain('3');
    });
  });

  describe('Blacklist Filtering', () => {
    it('returns empty array when blacklists is empty', () => {
      const { result } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, blacklists: [] }),
      );

      expect(result.current.filteredBlacklists).toEqual([]);
    });

    it('defaults to video blacklists when no category selected', () => {
      const blacklists = [
        createMockBlacklist({ category: ModelCategory.VIDEO, id: '1' }),
        createMockBlacklist({ category: ModelCategory.IMAGE, id: '2' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, blacklists }),
      );

      expect(result.current.filteredBlacklists).toHaveLength(1);
      expect(result.current.filteredBlacklists[0].id).toBe('1');
    });

    it('filters blacklists by current model category', () => {
      const blacklists = [
        createMockBlacklist({ category: ModelCategory.VIDEO, id: '1' }),
        createMockBlacklist({ category: ModelCategory.IMAGE, id: '2' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          blacklists,
          currentModelCategory: ModelCategory.IMAGE,
        }),
      );

      expect(result.current.filteredBlacklists).toHaveLength(1);
      expect(result.current.filteredBlacklists[0].id).toBe('2');
    });
  });

  describe('Sound Filtering', () => {
    it('returns empty array when sounds is empty', () => {
      const { result } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, sounds: [] }),
      );

      expect(result.current.filteredSounds).toEqual([]);
    });

    it('returns empty array for non-video models', () => {
      const sounds = [
        createMockSound({ id: '1' }),
        createMockSound({ id: '2' }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.IMAGE,
          sounds,
        }),
      );

      expect(result.current.filteredSounds).toEqual([]);
    });

    it('filters sounds for video models', () => {
      const sounds = [
        createMockSound({
          category: IngredientCategory.VIDEO,
          id: '1',
          isActive: true,
        }),
        createMockSound({
          category: IngredientCategory.VIDEO,
          id: '2',
          isActive: false,
        }),
        createMockSound({ category: null, id: '3', isActive: true }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          sounds,
        }),
      );

      expect(result.current.filteredSounds).toHaveLength(2);
    });

    it('only includes active sounds', () => {
      const sounds = [
        createMockSound({ id: '1', isActive: true }),
        createMockSound({ id: '2', isActive: false }),
      ];

      const { result } = renderHook(() =>
        usePromptBarFilters({
          ...baseOptions,
          currentModelCategory: ModelCategory.VIDEO,
          sounds,
        }),
      );

      expect(result.current.filteredSounds).toHaveLength(1);
      expect(result.current.filteredSounds[0].id).toBe('1');
    });
  });

  describe('All Return Values', () => {
    it('returns all expected filtered arrays', () => {
      const { result } = renderHook(() => usePromptBarFilters(baseOptions));

      expect(result.current).toHaveProperty('filteredStyles');
      expect(result.current).toHaveProperty('filteredMoods');
      expect(result.current).toHaveProperty('filteredCameras');
      expect(result.current).toHaveProperty('filteredScenes');
      expect(result.current).toHaveProperty('filteredLightings');
      expect(result.current).toHaveProperty('filteredLenses');
      expect(result.current).toHaveProperty('filteredCameraMovements');
      expect(result.current).toHaveProperty('filteredFontFamilies');
      expect(result.current).toHaveProperty('filteredPresets');
      expect(result.current).toHaveProperty('filteredBlacklists');
      expect(result.current).toHaveProperty('filteredSounds');
    });
  });

  describe('Memoization', () => {
    it('maintains referential equality when inputs do not change', () => {
      const styles = [createMockStyle()];

      const { result, rerender } = renderHook(() =>
        usePromptBarFilters({ ...baseOptions, styles }),
      );

      const firstFilteredStyles = result.current.filteredStyles;
      rerender();

      expect(result.current.filteredStyles).toBe(firstFilteredStyles);
    });
  });
});
