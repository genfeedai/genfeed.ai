// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAgentThreadCommands } from './use-agent-thread-commands';

const registerCommand = vi.fn();
const registerCommands = vi.fn();
const unregisterCommand = vi.fn();
const unregisterCommands = vi.fn();

vi.mock('@hooks/ui/use-command-palette/use-command-palette', () => ({
  useCommandPalette: () => ({
    registerCommand,
    registerCommands,
    unregisterCommand,
    unregisterCommands,
  }),
}));

describe('useAgentThreadCommands', () => {
  afterEach(() => {
    registerCommand.mockReset();
    registerCommands.mockReset();
    unregisterCommand.mockReset();
    unregisterCommands.mockReset();
  });

  it('registers thread commands on first render', () => {
    renderHook(() =>
      useAgentThreadCommands({
        onNavigate: vi.fn(),
        threads: [{ id: 'thread-1', title: 'First thread' }],
      }),
    );

    expect(registerCommands).toHaveBeenCalledTimes(1);
    expect(registerCommands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'agent-thread-thread-1',
        label: 'First thread',
      }),
    ]);
    expect(registerCommand).not.toHaveBeenCalled();
  });

  it('registers a hydrated thread list in one batch', () => {
    renderHook(() =>
      useAgentThreadCommands({
        onNavigate: vi.fn(),
        threads: [
          { id: 'thread-1', title: 'First thread' },
          { id: 'thread-2', title: 'Second thread' },
          { id: 'thread-3', title: 'Third thread' },
        ],
      }),
    );

    expect(registerCommands).toHaveBeenCalledTimes(1);
    expect(registerCommands.mock.calls[0]?.[0]).toHaveLength(3);
    expect(registerCommand).not.toHaveBeenCalled();
  });

  it('does not register commands for malformed thread ids', () => {
    renderHook(() =>
      useAgentThreadCommands({
        onNavigate: vi.fn(),
        threads: [
          { id: undefined as unknown as string, title: 'Missing id' },
          { id: 'undefined', title: 'Undefined id' },
          { id: 'thread-1', title: 'First thread' },
        ],
      }),
    );

    expect(registerCommands).toHaveBeenCalledTimes(1);
    expect(registerCommands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'agent-thread-thread-1',
      }),
    ]);
    expect(registerCommand).not.toHaveBeenCalled();
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
    registerCommands.mockClear();
    unregisterCommand.mockClear();
    unregisterCommands.mockClear();

    rerender({
      threads: [{ id: 'thread-1', title: 'First thread' }],
    });

    expect(registerCommand).not.toHaveBeenCalled();
    expect(registerCommands).not.toHaveBeenCalled();
    expect(unregisterCommand).not.toHaveBeenCalled();
    expect(unregisterCommands).not.toHaveBeenCalled();
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
    registerCommands.mockClear();
    unregisterCommand.mockClear();
    unregisterCommands.mockClear();

    rerender({
      threads: [{ id: 'thread-1', title: 'Renamed thread' }],
    });

    expect(unregisterCommands).toHaveBeenCalledWith(['agent-thread-thread-1']);
    expect(registerCommands).toHaveBeenCalledTimes(1);
    expect(registerCommands).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'agent-thread-thread-1',
        label: 'Renamed thread',
      }),
    ]);
    expect(registerCommand).not.toHaveBeenCalled();
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
    registerCommands.mockClear();
    unregisterCommand.mockClear();
    unregisterCommands.mockClear();

    rerender({
      threads: [{ id: 'thread-2', title: 'Second thread' }],
    });

    expect(unregisterCommands).toHaveBeenCalledWith(['agent-thread-thread-1']);
    expect(registerCommand).not.toHaveBeenCalled();
    expect(registerCommands).not.toHaveBeenCalled();
  });
});
