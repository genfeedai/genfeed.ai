import { describe, expect, it } from 'vitest';
import { createPathViewHref } from './filter-href.helper';

describe('createPathViewHref', () => {
  it('keeps filters, drops the legacy view param and pagination', () => {
    expect(
      createPathViewHref(
        '/workspace/inbox/all',
        'view=unread&taskId=1&page=4&status=a&status=b',
        'view',
      ),
    ).toBe('/workspace/inbox/all?taskId=1&status=a&status=b');
  });

  it('returns the bare path when no filters remain', () => {
    expect(
      createPathViewHref('/workspace/inbox/recent', 'view=all', 'view'),
    ).toBe('/workspace/inbox/recent');
  });
});
