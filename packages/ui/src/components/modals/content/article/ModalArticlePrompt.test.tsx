import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalArticle from '@ui/modals/content/article/ModalArticle';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeModal: vi.fn(),
  generateArticles: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateArticles: mocks.generateArticles,
  }),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: mocks.closeModal,
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      success: mocks.notifySuccess,
    }),
  },
}));

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div>
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  ),
}));

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the modal's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: {
    ariaLabel?: string;
    value?: string;
    isDisabled?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: () => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
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

vi.mock('@ui/prompt-bars/components/toolbar/PromptBarCompactSelect', () => ({
  default: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

async function openIdeaMode() {
  const user = userEvent.setup();
  render(<ModalArticle onConfirm={vi.fn()} onCreated={vi.fn()} />);
  await user.click(screen.getByRole('switch'));
  return user;
}

describe('ModalArticle prompt composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateArticles.mockResolvedValue([{ id: 'a-1' }, { id: 'a-2' }]);
  });

  it('keeps the idea prompt out of the manual article form', () => {
    render(<ModalArticle onConfirm={vi.fn()} />);

    expect(screen.queryByLabelText('Article Idea')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('swaps the footer submit for the composer send button in idea mode', async () => {
    await openIdeaMode();

    expect(screen.getByLabelText('Article Idea')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of Articles')).toHaveValue('1');
    expect(
      screen.queryByRole('button', { name: 'Create' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate 1 Article' }),
    ).toBeDisabled();
  });

  it('generates the chosen number of articles from the send button', async () => {
    const user = await openIdeaMode();

    await user.type(screen.getByLabelText('Article Idea'), '  AI in health  ');
    await user.selectOptions(screen.getByLabelText('Number of Articles'), '2');
    await user.click(
      screen.getByRole('button', { name: 'Generate 2 Articles' }),
    );

    await waitFor(() =>
      expect(mocks.generateArticles).toHaveBeenCalledWith(
        expect.objectContaining({ count: 2, prompt: 'AI in health' }),
      ),
    );
  });

  it('generates from the keyboard only once the idea has text', async () => {
    const user = await openIdeaMode();
    const idea = screen.getByLabelText('Article Idea');

    await user.type(idea, '{Enter}');
    expect(mocks.generateArticles).not.toHaveBeenCalled();

    await user.type(idea, 'Web trends{Enter}');
    await waitFor(() =>
      expect(mocks.generateArticles).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1, prompt: 'Web trends' }),
      ),
    );
  });
});
