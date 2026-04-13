import type { IVideo } from '@genfeedai/interfaces';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalTextOverlay from '@ui/modals/content/overlay/ModalTextOverlay';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children }: ModalProps) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  __esModule: true,
  Button: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  Input: () => <input data-testid="form-input" />,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  default: () => () =>
    Promise.resolve({
      updateTextOverlay: vi.fn(),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      updateTextOverlay: vi.fn(),
    }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('ModalTextOverlay', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
    video: {
      id: 'video-1',
      ingredientUrl: 'http://example.com/video.mp4',
    } as IVideo,
  };

  it('renders text overlay form', () => {
    render(<ModalTextOverlay {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
