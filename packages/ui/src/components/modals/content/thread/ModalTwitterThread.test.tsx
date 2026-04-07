import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalTwitterThread from '@ui/modals/content/thread/ModalTwitterThread';
import { describe, expect, it, vi } from 'vitest';

type MockButtonProps = {
  ariaLabel?: string;
  label: string;
  onClick?: () => void;
};

// Mock dependencies
vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick, ariaLabel }: MockButtonProps) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {label}
    </button>
  ),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    copyToClipboard: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      success: vi.fn(),
    }),
  },
}));

describe('ModalTwitterThread', () => {
  const defaultProps = {
    clipboardService: {
      copyToClipboard: vi.fn(),
    },
    isOpen: true,
    notificationsService: {
      success: vi.fn(),
    },
    onClose: vi.fn(),
    thread: {
      totalTweets: 2,
      tweets: [
        { characterCount: 11, content: 'First tweet', order: 1 },
        { characterCount: 12, content: 'Second tweet', order: 2 },
      ],
    },
  };

  it('renders thread modal when open', () => {
    render(<ModalTwitterThread {...defaultProps} />);
    expect(screen.getByText('First tweet')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalTwitterThread {...defaultProps} onClose={onClose} />);
    const closeButtons = screen.getAllByRole('button', { name: /^close$/i });
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
