import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalPrompt from '@ui/modals/content/prompt/ModalPrompt';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

const copyToClipboard = vi.fn();

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard,
    }),
  },
}));

describe('ModalPrompt', () => {
  const defaultProps = {
    enhancedPrompt: 'Enhanced prompt',
    onClose: vi.fn(),
    originalPrompt: 'Original prompt',
  };

  it('renders prompt modal', () => {
    render(<ModalPrompt {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('displays original and enhanced prompts', () => {
    render(<ModalPrompt {...defaultProps} />);
    expect(screen.getByText('Original prompt')).toBeInTheDocument();
    expect(screen.getByText('Style')).toBeInTheDocument();
  });

  it('calls onUsePrompt when use button is clicked', async () => {
    const user = userEvent.setup();
    const onUsePrompt = vi.fn();
    render(<ModalPrompt {...defaultProps} onUsePrompt={onUsePrompt} />);
    const useButton = screen.getByText(/use prompt/i);
    await user.click(useButton);
    expect(onUsePrompt).toHaveBeenCalled();
  });
});
