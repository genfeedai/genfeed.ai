import { PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModalPostRemix from '@ui/modals/content/remix/ModalPostRemix';

const closeModal = vi.fn();

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: (...args: unknown[]) => closeModal(...args),
}));

vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children, title }: ModalProps) => (
    <div data-testid="modal">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  __esModule: true,
  Button: ({
    label,
    children,
    onClick,
    isDisabled,
    ...props
  }: PropsWithChildren<{
    label?: string;
    onClick?: () => void;
    isDisabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} disabled={isDisabled} {...props}>
      {label || children}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@ui/editors/LazyRichTextEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  Input: ({
    value,
    onChange,
    name,
  }: {
    value?: string;
    name?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      data-testid="form-input"
      name={name}
      value={value}
      onChange={onChange}
    />
  ),
  default: ({
    value,
    onChange,
    name,
  }: {
    value?: string;
    name?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      data-testid="form-input"
      name={name}
      value={value}
      onChange={onChange}
    />
  ),
}));

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

describe('ModalPostRemix', () => {
  const post = {
    description: 'Test description',
    id: 'post-1',
    label: 'Test post',
    status: PostStatus.PUBLIC,
    totalLikes: 10,
    totalViews: 200,
  } as IPost;

  const baseProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    post,
  };

  it('should render without crashing', () => {
    render(<ModalPostRemix {...baseProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('submits the remix label and description, then closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ModalPostRemix post={post} onSubmit={onSubmit} onClose={onClose} />,
    );

    expect(
      screen.getByText(/Original post has 200 views - 10 likes/),
    ).toBeInTheDocument();

    await user.clear(screen.getByTestId('form-input'));
    await user.type(screen.getByTestId('form-input'), 'Night remix');
    await user.clear(screen.getByTestId('rich-text-editor'));
    await user.type(screen.getByTestId('rich-text-editor'), 'New caption');
    await user.click(screen.getByRole('button', { name: 'Create Remix' }));

    expect(onSubmit).toHaveBeenCalledWith('New caption', 'Night remix');
    expect(closeModal).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not submit a blank description and cancel only closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ModalPostRemix
        post={{ ...post, description: '', status: PostStatus.DRAFT }}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('button', { name: 'Create Remix' })).toBeDisabled();
    expect(screen.queryByText(/Original post has/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
