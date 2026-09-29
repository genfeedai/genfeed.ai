import {
  IngredientCategory,
  IngredientFormat,
  QualityTier,
} from '@genfeedai/contracts';
import { usePromptBarSync } from '@hooks/prompt-bar/use-prompt-bar-sync/use-prompt-bar-sync';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMockForm = () => ({
  control: {},
  formState: { isValid: true },
  getValues: vi.fn((field?: string) => {
    if (field === 'text') {
      return 'current text';
    }
    if (field === 'format') {
      return IngredientFormat.PORTRAIT;
    }
    if (field === 'models') {
      return ['model-1'];
    }
    if (field === 'width') {
      return 1080;
    }
    if (field === 'height') {
      return 1920;
    }
    if (field === 'references') {
      return [];
    }
    return {};
  }),
  setValue: vi.fn(),
  watch: vi.fn(),
});

const createBaseOptions = () => ({
  categoryType: undefined,
  externalFormat: undefined,
  externalHeight: undefined,
  externalWidth: undefined,
  form: createMockForm(),
  hasInitializedReferencesRef: { current: false },
  isUserSelectingReferencesRef: { current: false },
  models: [],
  onConfigChange: vi.fn(),
  onDatasetChange: vi.fn(),
  onTextChange: vi.fn(),
  promptConfig: undefined,
  promptData: undefined,
  promptText: undefined,
  referenceSource: '' as 'brand' | 'ingredient' | '',
  references: [],
  setReferenceSource: vi.fn(),
  setReferences: vi.fn(),
  useSplitState: false,
});

describe('usePromptBarSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() =>
        usePromptBarSync(createBaseOptions()),
      );

      expect(result.current).toHaveProperty('handleTextChange');
      expect(result.current).toHaveProperty('handleTextareaChange');
      expect(result.current).toHaveProperty('triggerConfigChange');
      expect(result.current).toHaveProperty('flushConfigChange');
      expect(result.current).toHaveProperty('isExternalUpdateRef');
      expect(result.current).toHaveProperty('lastPromptDataRef');
      expect(result.current).toHaveProperty('lastPromptConfigRef');
      expect(result.current).toHaveProperty(
        'hasReferencesEffectInitializedRef',
      );
      expect(result.current).toHaveProperty('setTextValue');
    });

    it('initializes refs correctly', () => {
      const { result } = renderHook(() =>
        usePromptBarSync(createBaseOptions()),
      );

      expect(result.current.isExternalUpdateRef.current).toBe(false);
      expect(result.current.lastPromptDataRef.current).toBeUndefined();
      expect(result.current.lastPromptConfigRef.current).toBeUndefined();
    });
  });

  describe('handleTextChange', () => {
    it('calls onTextChange in split state mode', () => {
      const options = {
        ...createBaseOptions(),
        useSplitState: true,
      };
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.handleTextChange();
      });

      expect(options.onTextChange).toHaveBeenCalledWith('current text');
    });

    it('does nothing when isExternalUpdate is true', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.isExternalUpdateRef.current = true;
        result.current.handleTextChange();
      });

      expect(options.onTextChange).not.toHaveBeenCalled();
    });
  });

  describe('handleTextareaChange', () => {
    it('debounces text value update', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.handleTextareaChange();
      });

      // Text value update is debounced at 150ms
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // setTextValue should be called after debounce
    });

    it('does nothing when isExternalUpdate is true', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.isExternalUpdateRef.current = true;
        result.current.handleTextareaChange();
      });

      expect(options.onTextChange).not.toHaveBeenCalled();
    });
  });

  describe('triggerConfigChange', () => {
    it('calls onConfigChange in split state mode', () => {
      const options = {
        ...createBaseOptions(),
        useSplitState: true,
      };
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.triggerConfigChange();
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(options.onConfigChange).toHaveBeenCalled();
    });

    it('does nothing when isExternalUpdate is true', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.isExternalUpdateRef.current = true;
        result.current.triggerConfigChange();
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(options.onDatasetChange).not.toHaveBeenCalled();
    });

    it('clears previous debounce timer on rapid calls', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.triggerConfigChange();
      });

      act(() => {
        vi.advanceTimersByTime(100);
        result.current.triggerConfigChange();
      });

      act(() => {
        vi.advanceTimersByTime(100);
        result.current.triggerConfigChange();
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should only be called once due to debouncing
      expect(options.onDatasetChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushConfigChange', () => {
    it('clears pending debounce timer', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarSync(options));

      // Start a debounced config change
      act(() => {
        result.current.triggerConfigChange();
      });

      // Flush before debounce completes
      act(() => {
        vi.advanceTimersByTime(100);
        result.current.flushConfigChange();
      });

      // The flush should call onDatasetChange
      expect(options.onDatasetChange).toHaveBeenCalledTimes(1);

      // Complete the original debounce timer
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should still only be called once
      expect(options.onDatasetChange).toHaveBeenCalledTimes(1);
    });

    it('calls onConfigChange in split state mode', () => {
      const options = {
        ...createBaseOptions(),
        useSplitState: true,
      };
      const { result } = renderHook(() => usePromptBarSync(options));

      act(() => {
        result.current.flushConfigChange();
      });

      expect(options.onConfigChange).toHaveBeenCalled();
    });
  });

  describe('External Format Sync', () => {
    it('syncs external format to form', () => {
      const options = {
        ...createBaseOptions(),
        externalFormat: IngredientFormat.LANDSCAPE,
        externalHeight: 1080,
        externalWidth: 1920,
      };

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith(
        'format',
        IngredientFormat.LANDSCAPE,
        { shouldValidate: true },
      );
      expect(options.form.setValue).toHaveBeenCalledWith('width', 1920, {
        shouldValidate: true,
      });
      expect(options.form.setValue).toHaveBeenCalledWith('height', 1080, {
        shouldValidate: true,
      });
    });
  });

  describe('Category Type Changes', () => {
    it('clears references when categoryType changes', () => {
      const options = {
        ...createBaseOptions(),
        categoryType: IngredientCategory.VIDEO,
      };

      renderHook(() => usePromptBarSync(options));

      expect(options.setReferences).toHaveBeenCalledWith([]);
      expect(options.setReferenceSource).toHaveBeenCalledWith('');
      expect(options.form.setValue).toHaveBeenCalledWith('references', [], {
        shouldValidate: true,
      });
    });

    it('resets dimensions to 1080x1920 when categoryType changes', () => {
      const options = {
        ...createBaseOptions(),
        categoryType: IngredientCategory.VIDEO,
      };

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith('width', 1080, {
        shouldValidate: true,
      });
      expect(options.form.setValue).toHaveBeenCalledWith('height', 1920, {
        shouldValidate: true,
      });
    });
  });

  describe('promptData Sync', () => {
    it('syncs references from promptData', () => {
      const options = {
        ...createBaseOptions(),
        promptData: { references: ['ref-1', 'ref-2'], text: 'text' },
      };

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith(
        'references',
        ['ref-1', 'ref-2'],
        { shouldValidate: true },
      );
    });
  });

  describe('promptConfig Sync (Split State Mode)', () => {
    it('syncs promptText into the form in split state mode', () => {
      const options = {
        ...createBaseOptions(),
        promptText: 'Cinematic portrait with dramatic rim light',
        useSplitState: true,
      };

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith(
        'text',
        'Cinematic portrait with dramatic rim light',
        { shouldValidate: true },
      );
    });

    it('syncs models from promptConfig', () => {
      const options = {
        ...createBaseOptions(),
        promptConfig: { models: ['model-a', 'model-b'] },
        useSplitState: true,
      };
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'models') {
          return [];
        }
        return undefined;
      });

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith(
        'models',
        ['model-a', 'model-b'],
        { shouldValidate: true },
      );
    });

    it('syncs duration from promptConfig', () => {
      const options = {
        ...createBaseOptions(),
        promptConfig: { duration: 5 },
        useSplitState: true,
      };
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'duration') {
          return undefined;
        }
        return undefined;
      });

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith('duration', 5, {
        shouldValidate: true,
      });
    });

    it('does not resync quality when the form already matches', () => {
      const options = {
        ...createBaseOptions(),
        promptConfig: { quality: QualityTier.ULTRA },
        useSplitState: true,
      };
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'quality') {
          return QualityTier.ULTRA;
        }
        return undefined;
      });

      renderHook(() => usePromptBarSync(options));

      const qualityCalls = options.form.setValue.mock.calls.filter(
        (call) => call[0] === 'quality',
      );
      expect(qualityCalls).toHaveLength(0);
    });

    it('syncs boolean flags from promptConfig', () => {
      const options = {
        ...createBaseOptions(),
        promptConfig: { isAudioEnabled: false, isBrandingEnabled: true },
        useSplitState: true,
      };
      options.form.getValues = vi.fn((field?: string) => {
        if (field === 'brandingMode') {
          return 'off';
        }
        if (field === 'isAudioEnabled') {
          return true;
        }
        return undefined;
      });

      renderHook(() => usePromptBarSync(options));

      expect(options.form.setValue).toHaveBeenCalledWith(
        'brandingMode',
        'brand',
        { shouldValidate: true },
      );
      expect(options.form.setValue).toHaveBeenCalledWith(
        'isAudioEnabled',
        false,
        { shouldValidate: true },
      );
    });
  });
});
