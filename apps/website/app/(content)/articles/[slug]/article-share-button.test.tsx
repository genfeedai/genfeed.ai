import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleShareButton from './article-share-button';

const copyToClipboard = vi.fn<(value: string) => Promise<void>>();

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

const logError = vi.fn();

vi.mock('@services/core/deferred-logger', () => ({
  deferredLogger: { error: (...args: unknown[]) => logError(...args) },
}));

beforeEach(() => {
  copyToClipboard.mockReset();
  logError.mockReset();
});

describe('ArticleShareButton', () => {
  it('copies the article URL and confirms it', async () => {
    copyToClipboard.mockResolvedValue();
    render(<ArticleShareButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeVisible(),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(window.location.href);
  });

  it('keeps the Share label when the clipboard refuses', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'));
    render(<ArticleShareButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    // Wait for the rejection handler itself, not just the call, before
    // asserting the label never flipped.
    await waitFor(() => expect(logError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
});
