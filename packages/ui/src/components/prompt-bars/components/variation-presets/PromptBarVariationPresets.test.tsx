import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarVariationPresets from '@ui/prompt-bars/components/variation-presets/PromptBarVariationPresets';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@genfeedai/constants', () => ({
  VARIATION_PROMPT_PRESETS: [
    { key: 'preset-1', label: 'Preset 1', prompt: 'Prompt for preset 1' },
    { key: 'preset-2', label: 'Preset 2', prompt: 'Prompt for preset 2' },
  ],
}));

describe('PromptBarVariationPresets', () => {
  const mockForm = {
    setValue: vi.fn(),
  };
  const mockSetTextValue = vi.fn();

  const defaultProps = {
    form: mockForm as any,
    setTextValue: mockSetTextValue,
    shouldRender: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when shouldRender is true', () => {
    const { container } = render(
      <PromptBarVariationPresets {...defaultProps} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Quick prompts:')).toBeInTheDocument();
  });

  it('returns null when shouldRender is false', () => {
    const { container } = render(
      <PromptBarVariationPresets {...defaultProps} shouldRender={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all preset buttons', () => {
    render(<PromptBarVariationPresets {...defaultProps} />);
    expect(screen.getByText('Preset 1')).toBeInTheDocument();
    expect(screen.getByText('Preset 2')).toBeInTheDocument();
  });

  it('calls form.setValue and setTextValue when preset is clicked', () => {
    render(<PromptBarVariationPresets {...defaultProps} />);

    const preset1Button = screen.getByText('Preset 1');
    fireEvent.click(preset1Button);

    expect(mockForm.setValue).toHaveBeenCalledWith(
      'text',
      'Prompt for preset 1',
      {
        shouldValidate: true,
      },
    );
    expect(mockSetTextValue).toHaveBeenCalledWith('Prompt for preset 1');
  });

  it('applies correct styling to preset buttons', () => {
    render(<PromptBarVariationPresets {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      // Button component now uses variant="ghost" size="xs" props instead of btn-* classes
      expect(button).toHaveClass('bg-white/5');
    });
  });
});
