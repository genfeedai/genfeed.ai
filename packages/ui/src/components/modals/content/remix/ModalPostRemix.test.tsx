import { PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { ModalProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import ModalPostRemix from '@ui/modals/content/remix/ModalPostRemix';

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

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/editors/RichTextEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="rich-text-editor" />,
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

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
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

  it('should handle user interactions correctly', () => {
    // TODO: Add interaction tests
  });

  it('should apply correct styles and classes', () => {
    // TODO: Add style tests
  });
});
