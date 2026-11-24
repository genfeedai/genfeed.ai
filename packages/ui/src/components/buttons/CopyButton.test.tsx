import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

const copyToClipboard = vi.fn<(text?: string) => Promise<boolean>>();

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard }) },
}));

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    copyToClipboard.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the value, then names itself "Copied" until the label resets', async () => {
    copyToClipboard.mockResolvedValue(true);
    const onCopied = vi.fn();
    render(
      <CopyButton
        label="Copy install command"
        onCopied={onCopied}
        value="bunx skills add genfeedai/skills"
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy install command' }),
      );
    });

    expect(copyToClipboard).toHaveBeenCalledWith(
      'bunx skills add genfeedai/skills',
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(onCopied).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(
      screen.getByRole('button', { name: 'Copy install command' }),
    ).toBeInTheDocument();
  });

  it('reads a function value at click time', async () => {
    copyToClipboard.mockResolvedValue(true);
    let current = 'first';
    render(<CopyButton label="Copy code" value={() => current} />);
    current = 'second';

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    });

    expect(copyToClipboard).toHaveBeenCalledWith('second');
  });

  it('keeps its label and reports a failed write', async () => {
    copyToClipboard.mockResolvedValue(false);
    const onCopyFailed = vi.fn();
    render(
      <CopyButton label="Copy link" onCopyFailed={onCopyFailed} value="x" />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    });

    expect(
      screen.getByRole('button', { name: 'Copy link' }),
    ).toBeInTheDocument();
    expect(onCopyFailed).toHaveBeenCalledTimes(1);
  });

  it('does not let the click reach a clickable parent', async () => {
    copyToClipboard.mockResolvedValue(true);
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <CopyButton label="Copy error" value="boom" />
      </div>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));
    });

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
