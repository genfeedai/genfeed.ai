import ModalBrandGenerate from '@ui/modals/brands/generate/ModalBrandGenerate';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  postGenerate: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ postGenerate: mocks.postGenerate }),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: mocks.closeModal,
}));

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the modal's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    placeholder,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: {
    ariaLabel?: string;
    placeholder?: string;
    value?: string;
    isDisabled?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: () => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    />
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div data-testid="modal">
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  ),
}));

describe('ModalBrandGenerate', () => {
  const defaultProps = {
    brandId: 'brand-1',
    onConfirm: vi.fn(),
    type: 'logo' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postGenerate.mockResolvedValue(undefined);
  });

  it('renders a single profile-picture prompt', () => {
    render(<ModalBrandGenerate {...defaultProps} />);

    expect(
      screen.getByRole('heading', { name: 'Generate Profile Picture' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Describe the profile picture'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('A square portrait of…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Description (optional)'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Enter a prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        'Describe what you want in the banner/logo',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
  });

  it('renders a single banner prompt', () => {
    render(<ModalBrandGenerate {...defaultProps} type="banner" />);

    expect(
      screen.getByRole('heading', { name: 'Generate Banner' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Describe the banner')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('A wide banner of…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Description (optional)'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
  });

  it('keeps Generate disabled until the prompt has text', async () => {
    const user = userEvent.setup();
    render(<ModalBrandGenerate {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    await user.type(screen.getByLabelText('Describe the profile picture'), ' ');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    await user.type(screen.getByLabelText('Describe the profile picture'), 'x');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it('generates from the send button with the trimmed prompt', async () => {
    const user = userEvent.setup();
    render(<ModalBrandGenerate {...defaultProps} type="banner" />);

    await user.type(
      screen.getByLabelText('Describe the banner'),
      '  Neon skyline  ',
    );
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(mocks.postGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'brand-1',
          text: 'Neon skyline',
        }),
      ),
    );
    await waitFor(() => expect(defaultProps.onConfirm).toHaveBeenCalled());
  });

  it('generates when the prompt is submitted from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ModalBrandGenerate {...defaultProps} />);

    const prompt = screen.getByLabelText('Describe the profile picture');
    await user.type(prompt, '{Enter}');
    expect(mocks.postGenerate).not.toHaveBeenCalled();

    await user.type(prompt, 'A friendly fox{Enter}');
    await waitFor(() =>
      expect(mocks.postGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'A friendly fox' }),
      ),
    );
  });
});
