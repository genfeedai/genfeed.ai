import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CopyLinkButton from './CopyLinkButton';

const copyToClipboard = vi.fn<(value: string) => Promise<boolean>>();

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

const logError = vi.fn();

vi.mock('@services/core/deferred-logger', () => ({
  deferredLogger: { error: (...args: unknown[]) => logError(...args) },
}));

const URL = 'https://genfeed.ai/@genfeedai/articles/launch';

beforeEach(() => {
  copyToClipboard.mockReset();
  logError.mockReset();
});

describe('CopyLinkButton', () => {
  it('copies the canonical URL and confirms it', async () => {
    copyToClipboard.mockResolvedValue(true);
    render(<CopyLinkButton url={URL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible(),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(URL);
  });

  it('keeps Copy link after the service handles a failed write', async () => {
    copyToClipboard.mockResolvedValue(false);
    render(<CopyLinkButton url={URL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Copied' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the Copy link label when the clipboard refuses', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'));
    render(<CopyLinkButton url={URL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(logError).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: 'Copy link' }),
    ).toBeInTheDocument();
  });
});
