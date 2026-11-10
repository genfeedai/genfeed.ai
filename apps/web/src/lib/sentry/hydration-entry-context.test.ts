// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  setTags: mocks.setTags,
}));

import { recordHydrationEntryContext } from './hydration-entry-context';

describe('recordHydrationEntryContext', () => {
  beforeEach(() => {
    mocks.setTags.mockClear();
    document.body.innerHTML = '';
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as PerformanceNavigationTiming,
    ]);
  });

  it('tags the load type, readiness, visibility and unrevealed boundaries', () => {
    document.body.innerHTML =
      '<template id="B:0"></template><template id="B:1"></template><template id="other"></template>';

    recordHydrationEntryContext();

    expect(mocks.setTags).toHaveBeenCalledWith({
      hydration_load_type: 'reload',
      hydration_pending_boundaries: '2',
      hydration_ready_state: document.readyState,
      hydration_visibility: document.visibilityState,
    });
  });

  it('reports an unknown load type when the browser exposes no navigation entry', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    recordHydrationEntryContext();

    expect(mocks.setTags).toHaveBeenCalledWith(
      expect.objectContaining({
        hydration_load_type: 'unknown',
        hydration_pending_boundaries: '0',
      }),
    );
  });
});
