import { render } from '@testing-library/react';
import PromptBarCollapsedView from '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('react-hook-form', () => ({
  useWatch: () => 'test text',
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  default: ({ placeholder }: any) => <input placeholder={placeholder} />,
}));

vi.mock('@ui/prompt-bars/components/divider/PromptBarDivider', () => ({
  default: () => <div data-testid="divider" />,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://test.com',
  },
}));

describe('PromptBarCollapsedView', () => {
  const mockForm = {
    control: {},
    getValues: vi.fn().mockReturnValue(''),
    setValue: vi.fn(),
  };

  const defaultProps = {
    activeGenerationsCount: 0,
    categoryType: 'image' as const,
    collapsedInputRef: { current: null },
    currentModelCategory: 'image',
    form: mockForm as any,
    formatIcon: <span>icon</span>,
    generateLabel: 'Generate',
    isDisabled: false,
    isFormValid: true,
    isGenerateDisabled: false,
    isGenerating: false,
    isInternalUpdateRef: { current: false },
    isProcessing: false,
    isRecording: false,
    isSupported: true,
    onClearReferences: vi.fn(),
    onExpand: vi.fn(),
    onFormatChange: vi.fn(),
    onOutputsChange: vi.fn(),
    onSubmit: vi.fn(),
    onTextChange: vi.fn(),
    outputs: 1,
    placeholder: 'Enter text...',
    referenceSource: null,
    references: [],
    selectedModelCost: 1,
    toggleVoice: vi.fn(),
    watchedFormat: 'portrait',
  };

  it('should render without crashing', () => {
    const { container } = render(<PromptBarCollapsedView {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render input field', () => {
    const { container } = render(<PromptBarCollapsedView {...defaultProps} />);
    expect(container.querySelector('input')).toBeInTheDocument();
  });

  it('should render with disabled state', () => {
    const { container } = render(
      <PromptBarCollapsedView {...defaultProps} isDisabled={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render while generating', () => {
    const { container } = render(
      <PromptBarCollapsedView {...defaultProps} isGenerating={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
