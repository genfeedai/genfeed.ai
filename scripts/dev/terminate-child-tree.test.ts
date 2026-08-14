import { describe, expect, it, vi } from 'vitest';
import {
  DETACHED_CHILD_SPAWN_OPTIONS,
  isOrphanedByInit,
  terminateChildTree,
} from './terminate-child-tree';

describe('terminateChildTree', () => {
  it('sends the signal to the process group first', () => {
    const killProcess = vi.fn();

    terminateChildTree(4242, 'SIGTERM', killProcess);

    expect(killProcess).toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(killProcess).toHaveBeenCalledTimes(1);
  });

  it('falls back to the direct pid when the process is not a group leader', () => {
    const killProcess = vi.fn((target: number) => {
      if (target < 0) {
        throw new Error('No such process');
      }
    });

    terminateChildTree(4242, 'SIGINT', killProcess);

    expect(killProcess).toHaveBeenNthCalledWith(1, -4242, 'SIGINT');
    expect(killProcess).toHaveBeenNthCalledWith(2, 4242, 'SIGINT');
  });

  it('ignores missing pids and already-exited children', () => {
    const killProcess = vi.fn(() => {
      throw new Error('No such process');
    });

    expect(() =>
      terminateChildTree(undefined, 'SIGTERM', killProcess),
    ).not.toThrow();
    expect(() => terminateChildTree(7, 'SIGTERM', killProcess)).not.toThrow();
    expect(killProcess).toHaveBeenCalledTimes(2);
  });
});

describe('orphan parent watchdog', () => {
  it('treats pid 1 as a dead parent on Unix', () => {
    expect(isOrphanedByInit(1)).toBe(true);
    expect(isOrphanedByInit(5645)).toBe(false);
  });

  it('spawns children in their own process group so the wrapper can reap them', () => {
    expect(DETACHED_CHILD_SPAWN_OPTIONS).toEqual({
      detached: true,
      stdio: 'inherit',
    });
  });
});
