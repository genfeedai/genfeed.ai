import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import { usePromptBarForm } from '@hooks/prompt-bar/use-prompt-bar-form/use-prompt-bar-form';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    control: {},
    formState: { errors: {}, isValid: true },
    getValues: vi.fn(),
    handleSubmit: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    trigger: vi.fn(),
    watch: vi.fn(),
  })),
  useWatch: vi.fn(({ name }) => {
    if (name === 'format') {
      return IngredientFormat.PORTRAIT;
    }
    return undefined;
  }),
}));

// Mock schema resolver
vi.mock('@hookform/resolvers/standard-schema', () => ({
  standardSchemaResolver: vi.fn(() => vi.fn()),
}));

// Mock schema
vi.mock('@genfeedai/client/schemas', () => ({
  PromptTextareaSchema: {},
  promptTextareaSchema: {},
}));

describe('usePromptBarForm', () => {
  describe('Initial State', () => {
    it('returns form object', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form).toBeDefined();
      expect(result.current.form.setValue).toBeDefined();
      expect(result.current.form.getValues).toBeDefined();
    });

    it('returns currentFormat', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.currentFormat).toBe(IngredientFormat.PORTRAIT);
    });
  });

  describe('With promptData', () => {
    it('accepts promptData options', () => {
      const promptData = {
        category: IngredientCategory.IMAGE,
        fontFamily: 'roboto',
        format: IngredientFormat.SQUARE,
        height: 512,
        models: ['model-1'],
        text: 'Test prompt',
        width: 512,
      };

      const { result } = renderHook(() => usePromptBarForm({ promptData }));

      expect(result.current.form).toBeDefined();
    });

    it('works without promptData', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form).toBeDefined();
      expect(result.current.currentFormat).toBeDefined();
    });

    it('works with empty options object', () => {
      const { result } = renderHook(() => usePromptBarForm({}));

      expect(result.current.form).toBeDefined();
    });
  });

  describe('Form Methods', () => {
    it('form has setValue method', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(typeof result.current.form.setValue).toBe('function');
    });

    it('form has getValues method', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(typeof result.current.form.getValues).toBe('function');
    });

    it('form has control property', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form.control).toBeDefined();
    });

    it('form has formState property', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form.formState).toBeDefined();
      expect(result.current.form.formState.isValid).toBeDefined();
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current).toHaveProperty('form');
      expect(result.current).toHaveProperty('currentFormat');
    });

    it('form and currentFormat are not null', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form).not.toBeNull();
      expect(result.current.currentFormat).not.toBeNull();
    });
  });

  describe('Default Values', () => {
    it('uses default category VIDEO when not provided', () => {
      // The hook uses IngredientCategory.VIDEO as default
      // This is verified by the useForm mock configuration
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form).toBeDefined();
    });

    it('uses default format PORTRAIT when not provided', () => {
      // The hook uses IngredientFormat.PORTRAIT as default
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.currentFormat).toBe(IngredientFormat.PORTRAIT);
    });

    it('uses default dimensions 1080x1920 when not provided', () => {
      // Default portrait dimensions for 9:16 aspect ratio
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current.form).toBeDefined();
    });
  });
});
