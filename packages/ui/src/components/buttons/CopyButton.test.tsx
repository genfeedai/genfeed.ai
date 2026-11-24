import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

/** What reached the clipboard, in order, and what the next write answers. */
const clipboard = vi.hoisted(() => ({
  isWritable: true,
  written: [] as Array<string | undefined>,
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: async (text?: string) => {
        clipboard.written.push(text);
        return clipboard.isWritable;
      },
    }),
  },
}));

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clipboard.isWritable = true;
    clipboard.written = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the value, then names itself "Copied" until the label resets', async () => {
    const outcomes: string[] = [];
    render(
      <CopyButton
        label="Copy install command"
        onCopied={() => outcomes.push('copied')}
        value="bunx skills add genfeedai/skills"
      />,
    );

    await click('Copy install command');

    expect(clipboard.written).toEqual(['bunx skills add genfeedai/skills']);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(outcomes).toEqual(['copied']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(
      screen.getByRole('button', { name: 'Copy install command' }),
    ).toBeInTheDocument();
  });

  it('reads a function value at click time', async () => {
    let current = 'first';
    render(<CopyButton label="Copy code" value={() => current} />);
    current = 'second';

    await click('Copy code');

    expect(clipboard.written).toEqual(['second']);
  });

  it('keeps its label and reports a failed write', async () => {
    clipboard.isWritable = false;
    const outcomes: string[] = [];
    render(
      <CopyButton
        label="Copy link"
        onCopied={() => outcomes.push('copied')}
        onCopyFailed={() => outcomes.push('failed')}
        value="x"
      />,
    );

    await click('Copy link');

    expect(
      screen.getByRole('button', { name: 'Copy link' }),
    ).toBeInTheDocument();
    expect(outcomes).toEqual(['failed']);
  });

  it('does not let the click reach a clickable parent', async () => {
    const rowClicks: string[] = [];
    render(
      <div onClick={() => rowClicks.push('row')}>
        <CopyButton label="Copy error" value="boom" />
      </div>,
    );

    await click('Copy error');

    expect(rowClicks).toEqual([]);
    expect(clipboard.written).toEqual(['boom']);
  });
});
