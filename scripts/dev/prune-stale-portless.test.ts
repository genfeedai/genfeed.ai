import { describe, expect, it, vi } from 'vitest';
import {
  PORTLESS_PRUNE_ARGS,
  pruneStalePortlessSessions,
  shouldPruneBeforePortlessRun,
} from './prune-stale-portless';

describe('pruneStalePortlessSessions', () => {
  it('only prunes on the outer Portless wrapper', () => {
    expect(shouldPruneBeforePortlessRun(false)).toBe(true);
    expect(shouldPruneBeforePortlessRun(true)).toBe(false);
  });

  it('runs `portless prune` and does not throw when prune is unavailable', () => {
    const run = vi.fn(() => ({
      error: new Error('portless not on PATH'),
      status: 1,
    }));

    expect(() => pruneStalePortlessSessions(run)).not.toThrow();
    expect(run).toHaveBeenCalledWith(PORTLESS_PRUNE_ARGS);
    expect(PORTLESS_PRUNE_ARGS).toEqual(['prune']);
  });

  it('runs prune once when the CLI succeeds', () => {
    const run = vi.fn(() => ({ status: 0 }));

    pruneStalePortlessSessions(run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(['prune']);
  });
});
