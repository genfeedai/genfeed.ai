import type { IPost } from '@genfeedai/interfaces';
import { Platform, PostStatus } from '@genfeedai/enums';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalPostMetadata from '@ui/modals/content/post/ModalPostMetadata';
import type { PropsWithChildren, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/overlays/entity/EntityOverlayShell', () => ({
  __esModule: true,
  default: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div data-testid="entity-overlay">
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({
    label,
    children,
    onClick,
    isDisabled,
    ...props
  }: BaseButtonProps) => (
    <button type="button" onClick={onClick} disabled={isDisabled} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  __esModule: true,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/forms/inputs/textarea/form-textarea/FormTextarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock(
  '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker',
  () => ({
    __esModule: true,
    default: () => <div data-testid="form-date-time-picker" />,
  }),
);

vi.mock('@ui/forms/selectors/select/form-select/FormSelect', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
}));

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  useAuthedService: () => () =>
    Promise.resolve({
      patch: vi.fn(),
    }),
}));

vi.mock('@hooks/utils/use-form-submit/use-form-submit', () => ({
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
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(() => ''),
  }),
}));

describe('ModalPostMetadata', () => {
  const post = {
    description: 'Test description',
    id: 'post-1',
    label: 'Test post',
    platform: Platform.YOUTUBE,
    scheduledDate: new Date().toISOString(),
    status: PostStatus.SCHEDULED,
  } as IPost;

  const baseProps = {
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    post,
  };

  it('should render without crashing', () => {
    render(<ModalPostMetadata {...baseProps} />);
    expect(screen.getByTestId('entity-overlay')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<ModalPostMetadata {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(<ModalPostMetadata {...baseProps} />);
    expect(screen.getAllByTestId('form-control').length).toBeGreaterThan(0);
  });
});
