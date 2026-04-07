import { render, screen } from '@testing-library/react';
import ModalArticle from '@ui/modals/content/article/ModalArticle';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
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
});
