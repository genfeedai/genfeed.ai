import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientFormat,
  ModelCategory,
  ModelKey,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { PromptBarModelControlsProps } from '@props/studio/prompt-bar.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromptBarModelControls from '@ui/prompt-bars/components/model-controls/PromptBarModelControls';
import { createRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/aspect-ratio.helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@helpers/aspect-ratio.helper')>();

  return {
    ...actual,
    isAspectRatioSupported: () => true,
  };
});

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

const capturedModelSelectorPopoverProps: {
  onChange?: (name: string, values: string[]) => void;
  autoLabel?: string;
  models?: IModel[];
  onPrioritizeChange?: (prioritize: RouterPriority) => void;
} = {};

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: (props: {
    models: IModel[];
    onChange: (name: string, values: string[]) => void;
    autoLabel?: string;
    onPrioritizeChange?: (prioritize: RouterPriority) => void;
  }) => {
    capturedModelSelectorPopoverProps.onChange = props.onChange;
    capturedModelSelectorPopoverProps.models = props.models;
    capturedModelSelectorPopoverProps.autoLabel = props.autoLabel;
    capturedModelSelectorPopoverProps.onPrioritizeChange =
      props.onPrioritizeChange;
    return (
      <div>
        <div data-testid="model-selector-popover">{props.autoLabel}</div>
        <button
          type="button"
          data-testid="priority-button"
          onClick={() => props.onPrioritizeChange?.(RouterPriority.QUALITY)}
        >
          Update auto priority
        </button>
      </div>
    );
  },
}));

describe('PromptBarModelControls', () => {
  const mockSetValue = vi.fn();

  beforeEach(() => {
    mockSetValue.mockClear();
    capturedModelSelectorPopoverProps.onChange = undefined;
    capturedModelSelectorPopoverProps.autoLabel = undefined;
    capturedModelSelectorPopoverProps.models = undefined;
    capturedModelSelectorPopoverProps.onPrioritizeChange = undefined;
  });

  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn((field?: string) => {
      if (field === 'format') {
        return IngredientFormat.PORTRAIT;
      }
      if (field === 'prioritize') {
        return RouterPriority.BALANCED;
      }
      return undefined;
    }),
    setValue: mockSetValue,
    watch: vi.fn((field?: string) => {
      if (field === 'autoSelectModel') {
        return false;
      }
      if (field === 'prioritize') {
        return RouterPriority.BALANCED;
      }
      return undefined;
    }),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const model: IModel = {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2024-01-01',
    id: 'model-1',
    isActive: true,
    isDefault: true,
    isDeleted: false,
    key: ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
    label: 'Imagen 3',
    provider: ModelProvider.REPLICATE,
    updatedAt: '2024-01-01',
  };

  const baseProps: PromptBarModelControlsProps = {
    controlClass: 'control-class',
    currentModelCategory: ModelCategory.IMAGE,
    form: mockForm,
    getDefaultVideoResolution: vi.fn().mockReturnValue(undefined),
    getModelDefaultDuration: vi.fn().mockReturnValue(undefined),
    hasModelButton: true,
    isAdvancedMode: true,
    isModelNotSet: false,
    modelDropdownRef: createRef<HTMLButtonElement>(),
    models: [model],
    normalizedWatchedModels: [model.key],
    promptBarHeight: 0,
    selectedModels: [model],
    trainingIds: new Set<string>(),
    trainings: [],
    triggerConfigChange: vi.fn(),
    watchedFormat: IngredientFormat.PORTRAIT,
    watchedModels: [model.key],
  };

  it('passes visible models into the shared selector', () => {
    render(<PromptBarModelControls {...baseProps} />);
    expect(capturedModelSelectorPopoverProps.models).toEqual([model]);
  });

  it('selecting Auto clears models and enables autoSelectModel', () => {
    render(<PromptBarModelControls {...baseProps} />);

    capturedModelSelectorPopoverProps.onChange?.('models', ['__auto_model__']);

    expect(mockSetValue).toHaveBeenCalledWith('autoSelectModel', true, {
      shouldValidate: true,
    });
    expect(mockSetValue).toHaveBeenCalledWith('models', [], {
      shouldDirty: false,
      shouldValidate: false,
    });
  });

  it('shows the compact auto label and updates auto priority in auto mode', async () => {
    const user = userEvent.setup();
    const autoModeForm = {
      ...mockForm,
      watch: vi.fn((field?: string) => {
        if (field === 'autoSelectModel') {
          return true;
        }
        if (field === 'prioritize') {
          return RouterPriority.BALANCED;
        }
        return undefined;
      }),
    } as unknown as UseFormReturn<PromptTextareaSchema>;

    render(<PromptBarModelControls {...baseProps} form={autoModeForm} />);

    expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
      'Auto · Balanced',
    );

    await user.click(screen.getByTestId('priority-button'));

    expect(mockSetValue).toHaveBeenCalledWith(
      'prioritize',
      RouterPriority.QUALITY,
      {
        shouldValidate: true,
      },
    );
  });

  it('selecting a concrete variant updates the form models', () => {
    render(<PromptBarModelControls {...baseProps} />);

    capturedModelSelectorPopoverProps.onChange?.('models', [model.key]);

    expect(mockSetValue).toHaveBeenCalledWith('autoSelectModel', false, {
      shouldValidate: true,
    });
    expect(mockSetValue).toHaveBeenCalledWith('models', [model.key], {
      shouldDirty: false,
      shouldValidate: false,
    });
  });

  it('passes the mapped auto label to the shared selector', () => {
    render(<PromptBarModelControls {...baseProps} />);

    expect(capturedModelSelectorPopoverProps.autoLabel).toBe('Auto · Balanced');
  });
});
