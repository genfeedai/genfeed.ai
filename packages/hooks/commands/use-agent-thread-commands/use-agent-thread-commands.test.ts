// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAgentThreadCommands } from './use-agent-thread-commands';

const registerCommand = vi.fn();
const unregisterCommand = vi.fn();

vi.mock('@hooks/ui/use-command-palette/use-command-palette', () => ({
  useCommandPalette: () => ({
    registerCommand,
    unregisterCommand,
  }),
}));

describe('useAgentThreadCommands', () => {
  afterEach(() => {
    registerCommand.mockReset();
    unregisterCommand.mockReset();
  });

  it('registers thread commands on first render', () => {
    renderHook(() =>
      useAgentThreadCommands({
        onNavigate: vi.fn(),
        threads: [{ id: 'thread-1', title: 'First thread' }],
      }),
    );

    expect(registerCommand).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-thread-thread-1',
        label: 'First thread',
      }),
    );
  });

  it('does not churn commands when the thread ids and labels are unchanged', () => {
    const { rerender } = renderHook(
      ({
        threads,
      }: {
        threads: Array<{ id: string; lastMessage?: string; title?: string }>;
      }) =>
        useAgentThreadCommands({
          onNavigate: vi.fn(),
          threads,
        }),
      {
        initialProps: {
          threads: [{ id: 'thread-1', title: 'First thread' }],
        },
      },
    );

    registerCommand.mockClear();
    unregisterCommand.mockClear();

    rerender({
      threads: [{ id: 'thread-1', title: 'First thread' }],
    });

    expect(registerCommand).not.toHaveBeenCalled();
    expect(unregisterCommand).not.toHaveBeenCalled();
  });

  it('updates only the changed thread command', () => {
    const { rerender } = renderHook(
      ({
        threads,
      }: {
        threads: Array<{ id: string; lastMessage?: string; title?: string }>;
      }) =>
        useAgentThreadCommands({
          onNavigate: vi.fn(),
          threads,
        }),
      {
        initialProps: {
          threads: [{ id: 'thread-1', title: 'First thread' }],
        },
      },
    );

    registerCommand.mockClear();
    unregisterCommand.mockClear();

    rerender({
      threads: [{ id: 'thread-1', title: 'Renamed thread' }],
    });

    expect(unregisterCommand).toHaveBeenCalledTimes(1);
    expect(unregisterCommand).toHaveBeenCalledWith('agent-thread-thread-1');
    expect(registerCommand).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-thread-thread-1',
        label: 'Renamed thread',
      }),
    );
  });

  it('unregisters only removed threads', () => {
    const { rerender } = renderHook(
      ({
        threads,
      }: {
        threads: Array<{ id: string; lastMessage?: string; title?: string }>;
      }) =>
        useAgentThreadCommands({
          onNavigate: vi.fn(),
          threads,
        }),
      {
        initialProps: {
          threads: [
            { id: 'thread-1', title: 'First thread' },
            { id: 'thread-2', title: 'Second thread' },
          ],
        },
      },
    );

    registerCommand.mockClear();
    unregisterCommand.mockClear();

    rerender({
      threads: [{ id: 'thread-2', title: 'Second thread' }],
    });

    expect(unregisterCommand).toHaveBeenCalledTimes(1);
    expect(unregisterCommand).toHaveBeenCalledWith('agent-thread-thread-1');
    expect(registerCommand).not.toHaveBeenCalled();
  });
});
