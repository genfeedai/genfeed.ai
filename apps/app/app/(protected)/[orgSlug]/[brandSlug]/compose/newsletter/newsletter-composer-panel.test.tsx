import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewsletterComposerPanel from './newsletter-composer-panel';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const copyToClipboardMock = vi.fn();
const generateDraftMock = vi.fn();
const patchMock = vi.fn();
const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: {
    getInstance: vi.fn(() => ({
      generateDraft: generateDraftMock,
      patch: patchMock,
    })),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateDraft: generateDraftMock,
    patch: patchMock,
  }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: copyToClipboardMock,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: errorMock,
      success: successMock,
    }),
  },
}));

vi.mock('@ui/editors/RichTextEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      aria-label="Content"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe('NewsletterComposerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a newsletter draft and hydrates the editor fields', async () => {
    generateDraftMock.mockResolvedValue({
      content: 'Draft body',
      id: 'newsletter-1',
      label: 'Issue 1',
      summary: 'Summary text',
    });

    render(<NewsletterComposerPanel />);

    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'AI workflows' },
    });
    fireEvent.change(screen.getByLabelText('Angle'), {
      target: { value: 'Operator lessons' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    await waitFor(() => {
      expect(generateDraftMock).toHaveBeenCalledWith({
        angle: 'Operator lessons',
        instructions: undefined,
        topic: 'AI workflows',
      });
    });

    expect(screen.getByLabelText('Draft label')).toHaveValue('Issue 1');
    expect(screen.getByLabelText('Summary')).toHaveValue('Summary text');
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Draft body');
  });

  it('copies the generated newsletter content', async () => {
    render(<NewsletterComposerPanel />);

    fireEvent.change(screen.getByLabelText('Draft label'), {
      target: { value: 'Issue 12' },
    });
    fireEvent.change(screen.getByTestId('rich-text-editor'), {
      target: { value: '<p>Long-form <strong>body</strong></p>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy content' }));

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith(
        'Issue 12\n\nLong-form body',
      );
    });
  });

  it('opens the newsletters workspace after a draft exists', async () => {
    generateDraftMock.mockResolvedValue({
      content: 'Draft body',
      id: 'newsletter-1',
      label: 'Issue 1',
      summary: 'Summary text',
    });

    render(<NewsletterComposerPanel />);

    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'AI workflows' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    await waitFor(() => {
      expect(generateDraftMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open newsletters' }));
    expect(pushMock).toHaveBeenCalledWith('/posts/newsletters?id=newsletter-1');
  });

  it('disables saving before a draft exists', () => {
    render(<NewsletterComposerPanel />);

    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(patchMock).not.toHaveBeenCalled();
  });
});
