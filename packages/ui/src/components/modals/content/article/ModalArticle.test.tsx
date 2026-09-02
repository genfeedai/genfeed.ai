import { ModalEnum } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import ModalArticle from '@ui/modals/content/article/ModalArticle';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/modal/Modal', () => ({
  default: function ModalMock({
    children,
    id,
    title,
  }: {
    children: ReactNode;
    id: string;
    title?: string;
  }) {
    return (
      <div data-modal-id={id} data-testid="modal">
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    );
  },
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: function ModalActionsMock({ children }: { children: ReactNode }) {
    return <div>{children}</div>;
  },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  default: () => () =>
    Promise.resolve({
      generateArticles: vi.fn(() => Promise.resolve([{ id: 'article-1' }])),
      post: vi.fn(() => Promise.resolve({ id: 'article-1' })),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      generateArticles: vi.fn(() => Promise.resolve([{ id: 'article-1' }])),
      post: vi.fn(() => Promise.resolve({ id: 'article-1' })),
    }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    clearErrors: vi.fn(),
    formState: { errors: {} },
    getValues: vi.fn(() => ({
      content: '',
      count: '1',
      label: '',
      prompt: '',
    })),
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setError: vi.fn(),
    setValue: vi.fn(),
    trigger: vi.fn(),
    watch: vi.fn(() => ''),
  }),
}));

describe('ModalArticle', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
  };

  it('renders article form', () => {
    render(<ModalArticle {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('listens on ModalEnum.ARTICLE so list Create can open it', () => {
    render(<ModalArticle {...defaultProps} />);

    expect(screen.getByTestId('modal')).toHaveAttribute(
      'data-modal-id',
      ModalEnum.ARTICLE,
    );
    expect(screen.getByText('Create New Article')).toBeInTheDocument();
  });
});
