import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat } from '@genfeedai/enums';
import type { PromptBarFormatControlsProps } from '@props/studio/prompt-bar.props';
import { render } from '@testing-library/react';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/aspect-ratio.helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@helpers/aspect-ratio.helper')>();

  return {
    ...actual,
    isAspectRatioSupported: () => true,
  };
});

const capturedAspectRatioDropdownProps: {
  onChange?: (name: string, value: string) => void;
  ratios?: readonly string[];
  value?: string;
} = {};

vi.mock('@ui/dropdowns/aspect-ratio/AspectRatioDropdown', () => ({
  default: (props: {
    onChange: (name: string, value: string) => void;
    ratios: readonly string[];
    value: string;
  }) => {
    capturedAspectRatioDropdownProps.onChange = props.onChange;
    capturedAspectRatioDropdownProps.ratios = props.ratios;
    capturedAspectRatioDropdownProps.value = props.value;

    return <div data-testid="aspect-ratio-dropdown" />;
  },
}));

describe('PromptBarFormatControls', () => {
  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn().mockReturnValue(IngredientFormat.LANDSCAPE),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const baseProps: PromptBarFormatControlsProps = {
    controlClass: 'control-class',
    currentConfig: { buttons: { format: true } },
    form: mockForm,
    formatIcon: <span>icon</span>,
    isDisabledState: false,
    normalizedWatchedModels: [],
    references: [],
    setReferenceSource: vi.fn(),
    setReferences: vi.fn(),
    triggerConfigChange: vi.fn(),
    watchedModel: 'model-1',
  };

  it('should render without crashing', () => {
    const { container } = render(<PromptBarFormatControls {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('passes mapped ratio values into the shared aspect ratio dropdown', () => {
    render(<PromptBarFormatControls {...baseProps} />);

    expect(capturedAspectRatioDropdownProps.value).toBe('16:9');
    expect(capturedAspectRatioDropdownProps.ratios).toEqual([
      '16:9',
      '9:16',
      '1:1',
    ]);
  });

  it('maps selected ratio changes back to prompt bar format state', () => {
    render(<PromptBarFormatControls {...baseProps} />);

    capturedAspectRatioDropdownProps.onChange?.('format', '9:16');

    expect(mockForm.setValue).toHaveBeenCalledWith(
      'format',
      IngredientFormat.PORTRAIT,
      {
        shouldDirty: false,
        shouldValidate: false,
      },
    );
  });
});
