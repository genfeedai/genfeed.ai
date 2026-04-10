import { render, screen } from '@testing-library/react';
import ModalPost from '@ui/modals/content/post/ModalPost';
import { describe, expect, it, vi } from 'vitest';

// Mock @tiptap/react to avoid prosemirror DOM issues in jsdom
const chainable = new Proxy(
  {},
  {
    get: () => {
      const fn = (..._args: unknown[]) => ({
        run: vi.fn(),
        ...new Proxy({}, { get: () => fn }),
      });
      return fn;
    },
  },
);

vi.mock('@tiptap/react', () => ({
  EditorContent: () => <div data-testid="editor-content" />,
  useEditor: () => ({
    chain: () => chainable,
    commands: { setContent: vi.fn() },
    getHTML: vi.fn(() => ''),
    isActive: vi.fn(() => false),
    isDestroyed: false,
    on: vi.fn(),
  }),
}));

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      id: 'brand-1',
      settings: {},
    },
  }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    formState: { errors: {} },
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    watch: vi.fn(() => ({})),
  }),
}));

describe('ModalPost', () => {
  const defaultProps = {
    credentials: [],
    ingredient: null,
    onConfirm: vi.fn(),
  };

  it('renders post form', () => {
    render(<ModalPost {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
