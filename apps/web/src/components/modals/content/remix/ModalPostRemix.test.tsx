import { PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChangeEvent, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Textarea } from '@ui/primitives/textarea';
import ModalPostRemix from '@/components/modals/content/remix/ModalPostRemix';

type Remix = { description: string; label?: string };

/** What the caller observes: each submitted remix and each close. */
function createCaller() {
  const caller = { closes: 0, remixes: [] as Remix[] };
  return {
    caller,
    onClose: () => {
      caller.closes += 1;
    },
    onSubmit: async (description: string, label?: string) => {
      caller.remixes.push({ description, label });
    },
  };
}

// Modal ids the dialog helper was asked to close.
const dialogs = vi.hoisted(() => ({ closed: [] as unknown[] }));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: (id: unknown) => {
    dialogs.closed.push(id);
  },
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

vi.mock('@/components/editors/LazyRichTextEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <Textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
        onChange?.(event.target.value)
      }
    />
  ),
}));

vi.mock('@/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
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

  beforeEach(() => {
    dialogs.closed = [];
  });

  it('opens prefilled with the original post', () => {
    const { onSubmit } = createCaller();
    render(<ModalPostRemix post={post} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Label')).toHaveValue('Remix: Test post');
    expect(screen.getByTestId('rich-text-editor')).toHaveValue(
      'Test description',
    );
  });

  it('submits the remix label and description, then closes', async () => {
    const user = userEvent.setup();
    const { caller, onClose, onSubmit } = createCaller();

    render(
      <ModalPostRemix post={post} onSubmit={onSubmit} onClose={onClose} />,
    );

    expect(
      screen.getByText(/Original post has 200 views - 10 likes/),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Night remix');
    await user.clear(screen.getByTestId('rich-text-editor'));
    await user.type(screen.getByTestId('rich-text-editor'), 'New caption');
    await user.click(screen.getByRole('button', { name: 'Create Remix' }));

    expect(caller.remixes).toEqual([
      { description: 'New caption', label: 'Night remix' },
    ]);
    expect(dialogs.closed).toHaveLength(1);
    expect(caller.closes).toBe(1);
  });

  it('does not submit a blank description and cancel only closes', async () => {
    const user = userEvent.setup();
    const { caller, onClose, onSubmit } = createCaller();

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
    expect(caller.remixes).toEqual([]);
    expect(caller.closes).toBe(1);
  });
});
