import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
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
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => usePromptBarForm());

      expect(result.current).toHaveProperty('form');
      expect(result.current).toHaveProperty('currentFormat');
    });
  });
});
