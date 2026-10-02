import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  PromptBarInternalContext,
  type PromptBarInternalContextValue,
} from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { IngredientFormat } from '@genfeedai/contracts';
import type { MediaReference } from '@genfeedai/contracts/interfaces/components/media-reference.interface';
import type { PromptBarFormatControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import { render } from '@testing-library/react';
import PromptBarFormatControls from '@ui/prompt-bars/components/format-controls/PromptBarFormatControls';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/aspect-ratio.helper', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@genfeedai/helpers/aspect-ratio.helper')
    >();

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

  it('leaves reviewed video aspect selection to the shared scalar component', () => {
    const key = 'crun/kling/v2-5-turbo-pro';
    const context = {
      models: [
        {
          key,
          provider: 'crun',
          inputControls: {
            mediaKind: 'video',
            fields: { aspect_ratio: { enum: ['16:9', '9:16'] } },
          },
        },
      ],
    } as unknown as PromptBarInternalContextValue;
    const { container } = render(
      <PromptBarInternalContext.Provider value={context}>
        <PromptBarFormatControls
          {...baseProps}
          normalizedWatchedModels={[key]}
        />
      </PromptBarInternalContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

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

describe('Crun legacy exact aspect carrier', () => {
  const key = 'crun/google/nano-banana-pro';
  const context = {
    models: [
      {
        key,
        provider: 'crun',
        inputControls: {
          isAutoAspectReferenceRequired: true,
          fields: { aspect_ratio: { enum: ['1:1', '21:9', 'auto'] } },
        },
      },
    ],
  } as unknown as PromptBarInternalContextValue;
  const envelope = {
    modelKey: key,
    contractVersion: 'reviewed-1',
    aspectRatio: '21:9',
    outputFormat: 'jpg' as const,
  };
  function setup(references: MediaReference[]) {
    const form = {
      getValues: vi.fn(() => envelope),
      setValue: vi.fn(),
    } as unknown as UseFormReturn<PromptTextareaSchema>;
    const setReferences = vi.fn();
    render(
      <PromptBarInternalContext.Provider value={context}>
        <PromptBarFormatControls
          currentConfig={{ buttons: { format: true } }}
          form={form}
          formatIcon={<span />}
          normalizedWatchedModels={[key]}
          watchedModel={key}
          references={references}
          setReferences={setReferences}
          setReferenceSource={vi.fn()}
          triggerConfigChange={vi.fn()}
          isDisabledState={false}
          controlClass="control"
        />
      </PromptBarInternalContext.Provider>,
    );
    return { form, setReferences };
  }
  it('round-trips 21:9/auto in the residual envelope without dimensions or reference clearing', () => {
    const { form, setReferences } = setup([{ id: 'image-1' }]);
    expect(capturedAspectRatioDropdownProps.value).toBe('21:9');
    expect(capturedAspectRatioDropdownProps.ratios).toEqual([
      '1:1',
      '21:9',
      'auto',
    ]);
    capturedAspectRatioDropdownProps.onChange?.('format', 'auto');
    expect(form.setValue).toHaveBeenCalledExactlyOnceWith(
      'crunControls',
      { ...envelope, aspectRatio: 'auto' },
      { shouldValidate: true },
    );
    expect(setReferences).not.toHaveBeenCalled();
  });
  it('hides auto while the required reference is missing', () => {
    setup([]);
    expect(capturedAspectRatioDropdownProps.ratios).toEqual(['1:1', '21:9']);
  });
});
