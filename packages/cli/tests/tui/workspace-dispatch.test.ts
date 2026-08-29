import { describe, expect, it, vi } from 'vitest';
import { dispatchWorkspaceInput, selectHistoryEntry } from '@/tui/workspace-dispatch';

describe('TUI workspace dispatch', () => {
  it('dispatches a parsed slash command to the operation handler', async () => {
    const runOperation = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();

    await dispatchWorkspaceInput(
      '/workflow run weekly-content',
      {
        appendError: vi.fn(),
        runMessage: vi.fn(),
        runOperation,
      },
      controller.signal
    );

    expect(runOperation).toHaveBeenCalledWith(
      {
        args: ['run', 'weekly-content'],
        name: 'workflow',
      },
      controller.signal
    );
  });

  it('appends operation failures as terminal errors', async () => {
    const appendError = vi.fn();

    await dispatchWorkspaceInput(
      '/balance',
      {
        appendError,
        runMessage: vi.fn(),
        runOperation: vi.fn().mockRejectedValue(new Error('Not authenticated')),
      },
      new AbortController().signal
    );

    expect(appendError).toHaveBeenCalledWith('Not authenticated');
  });

  it('keeps down-arrow history navigation bounded at the live input', () => {
    expect(selectHistoryEntry(['first', 'second'], -1, 'down')).toEqual({
      index: -1,
      value: '',
    });
    expect(selectHistoryEntry(['first', 'second'], 0, 'down')).toEqual({
      index: -1,
      value: '',
    });
    expect(selectHistoryEntry(['first', 'second'], -1, 'up')).toEqual({
      index: 0,
      value: 'second',
    });
  });
});
