import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowStore } from '../workflowStore';

/**
 * Global Image History is a package-only feature (issue #1151, step 4): the app
 * fork never had it. Reconciliation keeps it as canonical (its own
 * `GlobalImageHistory` panel consumes it), while the fork's dead `workflowTags`
 * plumbing — `setWorkflowTags` had zero callers — is dropped rather than ported.
 * These tests lock the kept feature so the fork deletion (step 5) can't regress it.
 */
describe('nodeSlice global image history', () => {
  beforeEach(() => {
    useWorkflowStore.getState().clearGlobalHistory();
  });

  it('prepends new items with a generated id', () => {
    useWorkflowStore
      .getState()
      .addToGlobalHistory({ image: 'https://asset.test/a.png', prompt: 'a' });
    useWorkflowStore
      .getState()
      .addToGlobalHistory({ image: 'https://asset.test/b.png', prompt: 'b' });

    const history = useWorkflowStore.getState().globalImageHistory;
    expect(history).toHaveLength(2);
    // Most recent first.
    expect(history[0].image).toBe('https://asset.test/b.png');
    expect(history[1].image).toBe('https://asset.test/a.png');
    expect(history[0].id).toBeTruthy();
    expect(history[0].id).not.toBe(history[1].id);
  });

  it('caps history at 100 items', () => {
    for (let i = 0; i < 105; i++) {
      useWorkflowStore
        .getState()
        .addToGlobalHistory({ image: `https://asset.test/${i}.png` });
    }

    const history = useWorkflowStore.getState().globalImageHistory;
    expect(history).toHaveLength(100);
    // The newest (index 104) is retained at the front; the oldest are dropped.
    expect(history[0].image).toBe('https://asset.test/104.png');
    expect(history[99].image).toBe('https://asset.test/5.png');
  });

  it('clears history', () => {
    useWorkflowStore
      .getState()
      .addToGlobalHistory({ image: 'https://asset.test/a.png' });
    useWorkflowStore.getState().clearGlobalHistory();

    expect(useWorkflowStore.getState().globalImageHistory).toEqual([]);
  });
});
