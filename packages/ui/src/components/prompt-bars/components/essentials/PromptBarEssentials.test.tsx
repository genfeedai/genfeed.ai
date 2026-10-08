import '@testing-library/jest-dom/vitest';
import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarEssentials from '@ui/prompt-bars/components/essentials/PromptBarEssentials';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    ariaLabel,
    children,
    icon,
    isDisabled,
    isLoading,
    label,
    onClick,
    tooltip,
    tooltipPosition,
    variant,
    withWrapper,
    wrapperClassName,
    textTransform,
    ...props
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    icon?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label?: string;
    onClick?: () => void;
    textTransform?: string;
    tooltip?: string;
    tooltipPosition?: string;
    variant?: string;
    withWrapper?: boolean;
    wrapperClassName?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled || isLoading}
      aria-label={ariaLabel}
      {...props}
    >
      {icon}
      {children ?? label}
    </button>
  ),
}));

const promptEditorProps: { extraExtensions?: unknown } = {};

vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    extraExtensions,
    testId,
    value,
  }: {
    extraExtensions?: unknown;
    testId?: string;
    value?: string;
  }) => {
    promptEditorProps.extraExtensions = extraExtensions;
    return (
      <div aria-label="Prompt" data-testid={testId} role="textbox" tabIndex={0}>
        {value}
      </div>
    );
  },
}));

vi.mock('@ui/primitives/checkbox', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@ui/primitives/dropdown-field', () => ({
  default: ({
    name,
    placeholder,
    label,
  }: {
    name?: string;
    placeholder?: string;
    label?: string;
  }) => <div>{label ?? placeholder ?? name ?? 'dropdown'}</div>,
}));

vi.mock(
  '@ui/prompt-bars/components/model-controls/PromptBarModelControls',
  () => ({
    default: () => <div data-testid="model-controls">model controls</div>,
  }),
);

vi.mock(
  '@ui/prompt-bars/components/format-controls/PromptBarFormatControls',
  () => ({
    default: () => <div data-testid="format-controls">format controls</div>,
  }),
);

vi.mock(
  '@ui/prompt-bars/components/quality-controls/PromptBarQualityControls',
  () => ({
    default: () => <div data-testid="quality-controls">quality controls</div>,
  }),
);

describe('PromptBarEssentials', () => {
  const defaultProps = {
    activeGenerations: [],
    avatars: [],
    categoryType: IngredientCategory.IMAGE,
    controlClass: 'control-class',
    currentConfig: {
      buttons: { model: true },
      defaultModel: 'kling-v2',
      placeholder: 'Describe your prompt',
    },
    currentModelCategory: undefined,
    enhancePrompt: vi.fn(),
    form: {
      control: {},
      formState: { isValid: true },
      getValues: vi.fn((name?: string) => {
        if (name === 'isBrandingEnabled') {
          return false;
        }
        return undefined;
      }),
      setValue: vi.fn(),
      watch: vi.fn((name?: string) => {
        if (name === 'text') {
          return '';
        }
        return undefined;
      }),
    },
    formatIcon: null,
    generationMeter: null,
    selectedModelCost: 0,
    getDefaultVideoResolution: vi.fn(),
    getMinFromAllModels: vi.fn(),
    getModelDefaultDuration: vi.fn(),
    getModelMaxOutputs: vi.fn(),
    handleCopy: vi.fn(),
    handleSubmitForm: vi.fn(),
    handleTextareaChange: vi.fn(),
    handleUndo: vi.fn(),
    hasModelWithoutDurationEditingValue: false,
    iconButtonClass: 'icon-button-class',
    isAdvancedControlsEnabled: true,
    isAdvancedMode: true,
    isAutoMode: false,
    isDisabledState: false,
    isEnhancing: false,
    isGenerateBlocked: false,
    isGenerateDisabled: false,
    isGenerating: false,
    isModelNotSet: false,
    isProcessing: false,
    isQuickOptionsOpen: false,
    isRecording: false,
    modelDropdownRef: { current: null },
    models: [{ key: 'kling-v2' }],
    normalizedWatchedModels: ['kling-v2'],
    onTextChange: vi.fn(),
    onToggleQuickOptions: vi.fn(),
    previousPrompt: '',
    promptBarHeight: 0,
    references: [],
    secondaryContent: undefined,
    selectedModels: [{ label: 'Kling V2.1' }],
    setIsAutoMode: vi.fn(),
    setReferenceSource: vi.fn(),
    setReferences: vi.fn(),
    setTextValue: vi.fn(),
    subscriptionTier: 'pro',
    textareaRef: { current: null },
    textareaRegister: {},
    toggleVoice: vi.fn(),
    trainingIds: new Set<string>(),
    trainings: [],
    triggerConfigChange: vi.fn(),
    videoDurations: [],
    voices: [],
    watchedFormat: IngredientFormat.PORTRAIT,
    watchedModel: 'kling-v2',
    watchedModels: ['kling-v2'],
    watchedQuality: 'standard',
  };

  it('forwards extraExtensions to PromptEditor', () => {
    const extraExtensions = [{ name: 'characterMention' }];
    render(
      <PromptBarEssentials
        {...defaultProps}
        extraExtensions={extraExtensions as never}
      />,
    );

    expect(promptEditorProps.extraExtensions).toBe(extraExtensions);
  });

  it('renders model controls before format controls without a separate mode toggle', () => {
    render(<PromptBarEssentials {...defaultProps} />);

    const modelControls = screen.getByTestId('model-controls');
    const formatControls = screen.getByTestId('format-controls');

    const controlsRow = modelControls.parentElement;

    expect(controlsRow).toContainElement(modelControls);
    expect(controlsRow).toContainElement(formatControls);
    expect(
      screen.queryByRole('button', { name: /auto/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /manual/i }),
    ).not.toBeInTheDocument();

    const orderedChildren = Array.from(controlsRow?.children ?? []);
    const modelIndex = orderedChildren.indexOf(modelControls);
    const formatIndex = orderedChildren.indexOf(formatControls);

    expect(modelIndex).toBeLessThan(formatIndex);
  });

  it('renders outputs-button when collapsible is true (default path)', () => {
    render(
      <PromptBarEssentials
        {...defaultProps}
        features={{ collapsible: true, dragDrop: false }}
      />,
    );

    expect(screen.getByTestId('outputs-button')).toBeInTheDocument();
  });

  it('renders outputs beside the generate button in unified shell', () => {
    const { container } = render(
      <PromptBarEssentials
        {...defaultProps}
        features={{ collapsible: false, dragDrop: false }}
      />,
    );

    const outputsButton = screen.getByTestId('outputs-button');
    const generateButton = screen.getByTestId('generate-button');

    const submitCluster = generateButton.parentElement?.parentElement;

    expect(submitCluster).toContainElement(outputsButton.parentElement);

    const orderedChildren = Array.from(submitCluster?.children ?? []);
    const outputsIndex = orderedChildren.indexOf(outputsButton.parentElement);
    const generateIndex = orderedChildren.indexOf(generateButton.parentElement);

    expect(outputsIndex).toBeGreaterThanOrEqual(0);
    expect(generateIndex).toBeGreaterThan(outputsIndex);
    expect(container).toBeInTheDocument();
  });

  it('keeps the unified shell submit button icon-only while preserving its accessible label', () => {
    render(
      <PromptBarEssentials
        {...defaultProps}
        features={{ collapsible: false, dragDrop: false }}
        generateLabel="Generate Image"
      />,
    );

    const generateButton = screen.getByRole('button', {
      name: 'Generate Image',
    });

    expect(generateButton).toHaveTextContent('');
  });

  it('renders suggestions only when the input is empty and hides them after typing', () => {
    const { rerender } = render(
      <PromptBarEssentials
        {...defaultProps}
        suggestions={[
          {
            id: 'create-plan',
            label: 'Create a plan',
            prompt: 'Create a plan for this prompt',
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Create a plan' }),
    ).toBeInTheDocument();

    rerender(
      <PromptBarEssentials
        {...defaultProps}
        form={{
          ...defaultProps.form,
          watch: vi.fn((name?: string) => {
            if (name === 'text') {
              return 'already typing';
            }
            return undefined;
          }),
        }}
        suggestions={[
          {
            id: 'create-plan',
            label: 'Create a plan',
            prompt: 'Create a plan for this prompt',
          },
        ]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Create a plan' }),
    ).not.toBeInTheDocument();
  });

  it('inserts the suggestion prompt by default when no custom handler is provided', () => {
    const setValue = vi.fn();
    const setTextValue = vi.fn();
    const onTextChange = vi.fn();

    render(
      <PromptBarEssentials
        {...defaultProps}
        form={{
          ...defaultProps.form,
          setValue,
        }}
        onTextChange={onTextChange}
        setTextValue={setTextValue}
        suggestions={[
          {
            id: 'plan-mode',
            label: 'Use plan mode',
            prompt: 'Use plan mode for this task',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use plan mode' }));

    expect(setValue).toHaveBeenCalledWith(
      'text',
      'Use plan mode for this task',
      {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      },
    );
    expect(setTextValue).toHaveBeenCalledWith('Use plan mode for this task');
    expect(onTextChange).toHaveBeenCalledWith('Use plan mode for this task');
  });

  it('replaces Generate with Stop when generating and onCancel is provided', () => {
    const onCancel = vi.fn();
    render(
      <PromptBarEssentials
        {...defaultProps}
        isGenerating
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByTestId('generate-button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stop-generation-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps Generate while generating when onCancel is omitted', () => {
    render(<PromptBarEssentials {...defaultProps} isGenerating />);

    expect(screen.getByTestId('generate-button')).toBeInTheDocument();
    expect(
      screen.queryByTestId('stop-generation-button'),
    ).not.toBeInTheDocument();
  });

  it('shows the generation meter in Simple Mode', () => {
    render(
      <PromptBarEssentials
        {...defaultProps}
        generationMeter={{
          ariaLabel: 'About 15 credits',
          credits: 15,
          isEstimate: true,
          label: '~15 cr',
          queuedCount: 0,
        }}
        isAdvancedMode={false}
      />,
    );

    expect(screen.getByTestId('studio-generation-meter')).toHaveTextContent(
      '~15 cr',
    );
    expect(screen.queryByTestId('model-controls')).not.toBeInTheDocument();
  });

  it('hides the generation meter when the resolver returns nothing', () => {
    render(<PromptBarEssentials {...defaultProps} generationMeter={null} />);

    expect(
      screen.queryByTestId('studio-generation-meter'),
    ).not.toBeInTheDocument();
  });
});
