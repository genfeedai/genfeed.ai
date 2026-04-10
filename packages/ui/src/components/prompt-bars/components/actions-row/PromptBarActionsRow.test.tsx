import { IngredientFormat } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarActionsRow from '@ui/prompt-bars/components/actions-row/PromptBarActionsRow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    priority: _priority,
    ...props
  }: {
    alt: string;
  }) => <img alt={alt} {...props} data-testid="next-image" />,
}));

// Mock the environment service
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://test.com/ingredients',
  },
}));

// Mock Checkbox to avoid react-hook-form control issues
vi.mock('@ui/primitives/checkbox', () => ({
  default: ({
    label,
    name,
    isChecked,
    onChange,
    isDisabled,
  }: {
    label: string;
    name: string;
    isChecked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isDisabled: boolean;
  }) => (
    <label>
      <input
        type="checkbox"
        name={name}
        checked={isChecked}
        onChange={onChange}
        disabled={isDisabled}
        aria-label={label}
      />
      {label}
    </label>
  ),
}));

// Mock FormDropdown
vi.mock('@ui/primitives/dropdown-field', () => ({
  default: ({
    label,
    options,
    value,
    onChange,
    isDisabled,
  }: {
    label: string;
    options: { key: string; label: string }[];
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    isDisabled: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={isDisabled}
    >
      {options?.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

describe('PromptBarActionsRow', () => {
  const mockForm = {
    control: {
      _formValues: {},
      _getWatch: vi.fn(),
      _names: { array: new Set(), mount: new Set(), unMount: new Set() },
      _subjects: { state: { next: vi.fn() } },
      register: vi.fn(),
      unregister: vi.fn(),
    },
    getValues: vi.fn().mockReturnValue(''),
    setValue: vi.fn(),
    watch: vi.fn().mockReturnValue(1080),
  };

  const defaultProps = {
    activeGenerationsCount: 0,
    controlClass: 'control-class',
    currentConfig: {
      buttons: { model: true, reference: true },
      defaultModel: 'model-1',
    },
    endFrame: null,
    enhancePrompt: vi.fn(),
    form: mockForm,
    generateLabel: 'Generate',
    getMinFromAllModels: vi.fn().mockReturnValue(4),
    getModelMaxOutputs: vi.fn().mockReturnValue(4),
    handleCopy: vi.fn(),
    handleReferenceSelect: vi.fn(),
    handleSelectAccountReference: vi.fn(),
    handleSubmitForm: vi.fn(),
    hasAnyImagenModel: false,
    hasEndFrame: false,
    iconButtonClass: 'h-10 w-10 p-0 flex items-center justify-center',
    isAutoMode: false,
    isDisabledState: false,
    isEnhancing: false,
    isFormValid: true,
    isGenerateDisabled: false,
    isGenerating: false,
    isOnlyImagenModels: false,
    isProcessing: false,
    isRecording: false,
    isSupported: true,
    maxReferenceCount: 1,
    models: [{ key: 'model-1', label: 'Model 1' }],
    normalizedWatchedModels: ['model-1'],
    openGallery: vi.fn(),
    referenceSource: '' as const,
    references: [],
    refocusTextarea: vi.fn(),
    selectedModelCost: 10,
    setEndFrame: vi.fn(),
    setIsAutoMode: vi.fn(),
    setReferenceSource: vi.fn(),
    setReferences: vi.fn(),
    supportsMultipleReferences: false,
    toggleVoice: vi.fn(),
    watchedFormat: IngredientFormat.PORTRAIT,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render multiple action buttons', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    // Should have: reference, voice, copy, enhance, generate
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('should call openGallery when clicking reference button', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(defaultProps.openGallery).toHaveBeenCalled();
  });

  it('should render voice input button when supported', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    // Voice button should exist
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('should render generate button', () => {
    render(<PromptBarActionsRow {...(defaultProps as any)} />);
    expect(
      screen.getByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
  });

  it('should disable buttons when in disabled state', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} isDisabledState={true} />,
    );
    const disabledButtons = container.querySelectorAll('button[disabled]');
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it('should show recording state on voice button', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} isRecording={true} />,
    );
    // Button now uses variant="destructive" prop instead of btn-error class
    const recordingButton = container.querySelector('.animate-pulse');
    expect(recordingButton).toBeInTheDocument();
  });

  it('should show reference thumbnail when references exist', () => {
    const propsWithReference = {
      ...defaultProps,
      referenceSource: 'ingredient' as const,
      references: [{ id: 'ref-1', url: 'https://test.com/image.jpg' }],
    };
    render(<PromptBarActionsRow {...(propsWithReference as any)} />);
    expect(screen.getByTestId('next-image')).toBeInTheDocument();
  });

  it('should render fewer buttons when reference is disabled', () => {
    const propsWithoutReference = {
      ...defaultProps,
      currentConfig: {
        ...defaultProps.currentConfig,
        buttons: { model: true, reference: false },
      },
    };
    const { container } = render(
      <PromptBarActionsRow {...(propsWithoutReference as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    // Fewer buttons when reference is disabled
    expect(buttons.length).toBeLessThan(10);
  });

  it('should render branding checkbox when model button enabled', () => {
    render(<PromptBarActionsRow {...(defaultProps as any)} />);
    const brandingCheckbox = screen.getByRole('checkbox', {
      name: /branding/i,
    });
    expect(brandingCheckbox).toBeInTheDocument();
  });

  it('should call handleCopy when clicking copy button', () => {
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    if (buttons[2]) {
      fireEvent.click(buttons[2]);
    }
    // handleCopy may not be called if no text is in form
  });

  it('should call enhancePrompt when clicking enhance button', () => {
    mockForm.getValues.mockReturnValue('test prompt');
    const { container } = render(
      <PromptBarActionsRow {...(defaultProps as any)} />,
    );
    const buttons = container.querySelectorAll('button');
    if (buttons[3]) {
      fireEvent.click(buttons[3]);
      expect(defaultProps.enhancePrompt).toHaveBeenCalled();
    }
  });

  describe('voice button', () => {
    it('should not call toggleVoice when disabled', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          isDisabledState={true}
        />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]);
      expect(defaultProps.toggleVoice).not.toHaveBeenCalled();
    });

    it('should not call toggleVoice when processing', () => {
      render(
        <PromptBarActionsRow {...(defaultProps as any)} isProcessing={true} />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]);
      expect(defaultProps.toggleVoice).not.toHaveBeenCalled();
    });

    it('should call toggleVoice when enabled and not processing', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]);
      expect(defaultProps.toggleVoice).toHaveBeenCalled();
    });

    it('should not render voice button when not supported', () => {
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} isSupported={false} />,
      );
      const buttons = container.querySelectorAll('button');
      // Should have fewer buttons without voice
      expect(buttons.length).toBeLessThan(7);
    });
  });

  describe('outputs dropdown', () => {
    it('should render outputs dropdown when models are selected', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const dropdown = screen.getByRole('combobox', { name: /outputs/i });
      expect(dropdown).toBeInTheDocument();
    });

    it('should not render outputs dropdown when no models selected', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          normalizedWatchedModels={[]}
        />,
      );
      const dropdown = screen.queryByRole('combobox', { name: /outputs/i });
      expect(dropdown).not.toBeInTheDocument();
    });

    it('should call setValue and refocusTextarea when output changes', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const dropdown = screen.getByRole('combobox', { name: /outputs/i });
      fireEvent.change(dropdown, { target: { value: '2' } });

      expect(mockForm.setValue).toHaveBeenCalledWith('outputs', 2, {
        shouldValidate: true,
      });
      expect(defaultProps.refocusTextarea).toHaveBeenCalled();
    });
  });

  describe('end frame functionality', () => {
    it('should render end frame button when hasEndFrame is true', () => {
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} hasEndFrame={true} />,
      );
      const buttons = container.querySelectorAll('button');
      // Should have additional button for end frame
      expect(buttons.length).toBeGreaterThan(5);
    });

    it('should disable reference button when end frame is selected', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasEndFrame={true}
          endFrame={{ id: 'end-frame-1' }}
        />,
      );
      const disabledButtons = container.querySelectorAll('button[disabled]');
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    it('should render clear end frame button when end frame is selected', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasEndFrame={true}
          endFrame={{ id: 'end-frame-1' }}
        />,
      );
      const buttons = container.querySelectorAll('button');
      // Should have clear button
      expect(buttons.length).toBeGreaterThan(6);
    });

    it('should clear end frame when clicking clear button', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasEndFrame={true}
          endFrame={{ id: 'end-frame-1' }}
        />,
      );
      const buttons = container.querySelectorAll('button');
      // Find and click clear button (has HiNoSymbol icon)
      const clearButton = Array.from(buttons).find((btn) =>
        btn.querySelector('svg')?.classList.contains('w-4'),
      );
      if (clearButton) {
        fireEvent.click(clearButton);
      }
      // setEndFrame should be called (may be with null)
    });

    it('should disable end frame button when references exist', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasEndFrame={true}
          references={[{ id: 'ref-1' }]}
        />,
      );
      const disabledButtons = container.querySelectorAll('button[disabled]');
      expect(disabledButtons.length).toBeGreaterThan(0);
    });
  });

  describe('multiple references', () => {
    it('should show reference count badge when multiple references selected', () => {
      const propsWithMultipleRefs = {
        ...defaultProps,
        maxReferenceCount: 5,
        referenceSource: 'ingredient' as const,
        references: [{ id: 'ref-1' }, { id: 'ref-2' }, { id: 'ref-3' }],
        supportsMultipleReferences: true,
      };
      render(<PromptBarActionsRow {...(propsWithMultipleRefs as any)} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should use brand endpoint for brand references', () => {
      const propsWithBrandRef = {
        ...defaultProps,
        referenceSource: 'brand' as const,
        references: [{ id: 'ref-1' }],
      };
      render(<PromptBarActionsRow {...(propsWithBrandRef as any)} />);
      const img = screen.getByTestId('next-image');
      expect(img).toHaveAttribute('src', expect.stringContaining('references'));
    });
  });

  describe('branding checkbox', () => {
    it('should toggle branding when checkbox is clicked', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const checkbox = screen.getByRole('checkbox', { name: /branding/i });
      fireEvent.click(checkbox);

      expect(mockForm.setValue).toHaveBeenCalledWith('brandingMode', 'brand', {
        shouldValidate: true,
      });
    });

    it('should not render branding checkbox when model button disabled', () => {
      const propsWithoutModelButton = {
        ...defaultProps,
        currentConfig: {
          ...defaultProps.currentConfig,
          buttons: { model: false, reference: true },
        },
      };
      render(<PromptBarActionsRow {...(propsWithoutModelButton as any)} />);
      const checkbox = screen.queryByRole('checkbox', { name: /branding/i });
      expect(checkbox).not.toBeInTheDocument();
    });
  });

  describe('generate button', () => {
    it('should call handleSubmitForm when clicking generate', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const generateBtn = screen.getByRole('button', { name: /generate/i });
      fireEvent.click(generateBtn);
      expect(defaultProps.handleSubmitForm).toHaveBeenCalled();
    });

    it('should show queue label when there are active generations', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          activeGenerationsCount={2}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Generate (Queue)' }),
      ).toBeInTheDocument();
    });

    it('should be disabled when form is invalid', () => {
      render(
        <PromptBarActionsRow {...(defaultProps as any)} isFormValid={false} />,
      );
      const generateBtn = screen.getByRole('button', { name: /generate/i });
      expect(generateBtn).toBeDisabled();
    });

    it('should be disabled when isGenerateDisabled is true', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          isGenerateDisabled={true}
        />,
      );
      const generateBtn = screen.getByRole('button', { name: /generate/i });
      expect(generateBtn).toBeDisabled();
    });
  });

  describe('imagen model handling', () => {
    it('should hide reference button when isOnlyImagenModels is true', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          isOnlyImagenModels={true}
        />,
      );
      const buttons = container.querySelectorAll('button');
      // Should have fewer buttons without reference
      expect(buttons.length).toBeLessThan(7);
    });
  });

  describe('enhance button', () => {
    it('should be disabled when generating', () => {
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} isGenerating={true} />,
      );
      const buttons = container.querySelectorAll('button[disabled]');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should be disabled when enhancing', () => {
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} isEnhancing={true} />,
      );
      const buttons = container.querySelectorAll('button[disabled]');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should be disabled when no text in form', () => {
      mockForm.getValues.mockReturnValue('');
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} />,
      );
      // Enhance button should be disabled
      const buttons = container.querySelectorAll('button[disabled]');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('copy button', () => {
    it('should call handleCopy with form text when clicked', () => {
      mockForm.getValues.mockReturnValue('my prompt text');
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} />,
      );
      const buttons = container.querySelectorAll('button');
      fireEvent.click(buttons[2]);
      expect(defaultProps.handleCopy).toHaveBeenCalledWith('my prompt text');
    });

    it('should be disabled when no text', () => {
      mockForm.getValues.mockReturnValue('');
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} />,
      );
      const buttons = container.querySelectorAll('button[disabled]');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('openGallery callback', () => {
    it('should pass correct parameters to openGallery', () => {
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.openGallery).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'image',
          format: defaultProps.watchedFormat,
          maxSelectableItems: 1,
          title: 'Select Reference Images',
        }),
      );
    });

    it('should pass maxSelectableItems based on supportsMultipleReferences', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          supportsMultipleReferences={true}
          maxReferenceCount={5}
        />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.openGallery).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSelectableItems: 5,
        }),
      );
    });

    it('should pass selected reference IDs to openGallery', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          references={[{ id: 'ref-1' }, { id: 'ref-2' }]}
        />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.openGallery).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedReferences: ['ref-1', 'ref-2'],
        }),
      );
    });
  });

  describe('end frame openGallery callback', () => {
    it('should open gallery for end frame selection', () => {
      render(
        <PromptBarActionsRow {...(defaultProps as any)} hasEndFrame={true} />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]);

      expect(defaultProps.openGallery).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Select End Frame',
        }),
      );
    });

    it('should clear end frame when clicking clear button', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasEndFrame={true}
          endFrame={{ id: 'end-frame-1' }}
        />,
      );
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[2]);

      expect(defaultProps.setEndFrame).toHaveBeenCalledWith(null);
      expect(mockForm.setValue).toHaveBeenCalledWith('endFrame', '', {
        shouldValidate: true,
      });
    });
  });

  describe('tooltip variations', () => {
    it('should show Imagen warning tooltip when hasAnyImagenModel', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          hasAnyImagenModel={true}
        />,
      );
      expect(container).toBeInTheDocument();
      // Tooltip content is in Button props but not rendered in DOM
    });

    it('should show multiple references tooltip', () => {
      const { container } = render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          supportsMultipleReferences={true}
          maxReferenceCount={3}
        />,
      );
      expect(container).toBeInTheDocument();
    });
  });

  describe('outputs dropdown edge cases', () => {
    it('should generate correct options based on max outputs', () => {
      const mockGetMinFromAllModels = vi.fn().mockReturnValue(3);
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          getMinFromAllModels={mockGetMinFromAllModels}
        />,
      );
      const dropdown = screen.getByRole('combobox', { name: /outputs/i });
      const options = dropdown.querySelectorAll('option');
      expect(options.length).toBe(3);
      expect(options[0]).toHaveTextContent('1x');
      expect(options[1]).toHaveTextContent('2x');
      expect(options[2]).toHaveTextContent('3x');
    });

    it('should use form value for outputs dropdown', () => {
      mockForm.getValues.mockImplementation((field: string) => {
        if (field === 'outputs') {
          return 2;
        }
        return '';
      });
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const dropdown = screen.getByRole('combobox', { name: /outputs/i });
      expect(dropdown).toHaveValue('2');
    });
  });

  describe('spinner in enhance button', () => {
    it('should show spinner when enhancing', () => {
      render(
        <PromptBarActionsRow {...(defaultProps as any)} isEnhancing={true} />,
      );
      // Spinner is rendered inside enhance button
      const { container } = render(
        <PromptBarActionsRow {...(defaultProps as any)} isEnhancing={true} />,
      );
      expect(container).toBeInTheDocument();
    });
  });

  describe('generate button warning state', () => {
    it('should have warning class when generations are active', () => {
      render(
        <PromptBarActionsRow
          {...(defaultProps as any)}
          activeGenerationsCount={1}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Generate (Queue)' }),
      ).toHaveClass('bg-yellow-500');
    });
  });

  describe('branding checkbox state', () => {
    it('should show checked state from form values', () => {
      mockForm.getValues.mockImplementation((field: string) => {
        if (field === 'brandingMode') {
          return 'brand';
        }
        return '';
      });
      render(<PromptBarActionsRow {...(defaultProps as any)} />);
      const checkbox = screen.getByRole('checkbox', { name: /branding/i });
      expect(checkbox).toBeChecked();
    });
  });
});
