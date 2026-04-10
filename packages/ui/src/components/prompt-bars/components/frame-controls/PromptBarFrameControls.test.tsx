import '@testing-library/jest-dom';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat } from '@genfeedai/enums';
import type { PromptBarFrameControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarFrameControls from '@ui/prompt-bars/components/frame-controls/PromptBarFrameControls';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ icon, label, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label ?? icon}
    </button>
  ),
}));

describe('PromptBarFrameControls', () => {
  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn(),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const defaultProps: PromptBarFrameControlsProps = {
    disabled: false,
    endFrame: null,
    form: mockForm,
    hasAnyImagenModel: false,
    hasEndFrame: true,
    hasInterpolation: false,
    iconButtonClass: 'icon-button',
    isVideoModel: true,
    maxReferenceCount: 1,
    onEndFrameChange: vi.fn(),
    onReferenceSourceChange: vi.fn(),
    onReferencesChange: vi.fn(),
    openGallery: vi.fn(),
    openUpload: vi.fn(),
    referenceSource: '',
    references: [],
    requiresReferences: false,
    supportsMultipleReferences: false,
    triggerConfigChange: vi.fn(),
    watchedFormat: IngredientFormat.PORTRAIT,
    watchedHeight: 1080,
    watchedWidth: 1920,
  };

  it('should render without crashing', () => {
    const { container } = render(<PromptBarFrameControls {...defaultProps} />);
    expect(
      container.querySelector('[data-testid="reference-button"]'),
    ).toBeInTheDocument();
  });

  it('should render end frame button when enabled', () => {
    render(<PromptBarFrameControls {...defaultProps} />);
    expect(screen.getByTestId('end-frame-button')).toBeInTheDocument();
  });

  it('should call openGallery when start frame button is clicked', () => {
    render(<PromptBarFrameControls {...defaultProps} />);

    fireEvent.click(screen.getByTestId('reference-button'));
    expect(defaultProps.openGallery).toHaveBeenCalled();
  });

  it('should call openUpload when upload button is clicked', () => {
    render(<PromptBarFrameControls {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    const uploadButton = buttons[buttons.length - 1];
    fireEvent.click(uploadButton);

    expect(defaultProps.openUpload).toHaveBeenCalled();
  });
});
