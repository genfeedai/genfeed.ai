import { describe, expect, it } from 'vitest';
import { resolveLegacyPublishingViewPath } from './legacy-view-redirect';

describe('resolveLegacyPublishingViewPath', () => {
  it('moves the approvals tab to its own path with run and item as segments', () => {
    expect(
      resolveLegacyPublishingViewPath({
        filter: 'all',
        item: 'item-1',
        run: 'run-1',
        view: 'approvals',
      }),
    ).toBe('/publishing/approvals/run-1/item-1?filter=all');
  });

  it('keeps the review inbox gate on the approvals path', () => {
    expect(
      resolveLegacyPublishingViewPath({
        approval: 'apr-1',
        view: 'approvals',
      }),
    ).toBe('/publishing/approvals?approval=apr-1');
  });

  it('moves the calendar tab and carries its other params', () => {
    expect(resolveLegacyPublishingViewPath({ view: 'calendar' })).toBe(
      '/publishing/calendar',
    );
    expect(
      resolveLegacyPublishingViewPath({
        platform: ['x', 'instagram'],
        release: 'rel-1',
        view: 'calendar',
      }),
    ).toBe('/publishing/calendar?platform=x&platform=instagram&release=rel-1');
  });

  it('leaves the list, board and grid display toggles on Posts', () => {
    expect(resolveLegacyPublishingViewPath({})).toBeNull();
    expect(resolveLegacyPublishingViewPath({ view: 'board' })).toBeNull();
    expect(resolveLegacyPublishingViewPath({ view: ['grid'] })).toBeNull();
  });
});
