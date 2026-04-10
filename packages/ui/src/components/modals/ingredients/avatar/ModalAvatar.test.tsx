import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalAvatar from '@ui/modals/ingredients/avatar/ModalAvatar';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children }: ModalProps) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  default: () => () =>
    Promise.resolve({
      createAvatar: vi.fn(),
      post: vi.fn(),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      createAvatar: vi.fn(),
      post: vi.fn(),
    }),
}));

vi.mock('@genfeedai/hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: () => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {} },
    getValues: vi.fn(),
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(() => ''),
  }),
}));

describe('ModalAvatar', () => {
  const defaultProps = {
    avatarId: 'avatar-1',
    onConfirm: vi.fn(),
    text: 'Test text',
    voiceId: 'voice-1',
  };

  it('renders avatar modal', () => {
    render(<ModalAvatar {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
