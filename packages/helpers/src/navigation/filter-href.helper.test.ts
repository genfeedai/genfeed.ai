import { describe, expect, it } from 'vitest';
import { createFilterHref, createPathViewHref } from './filter-href.helper';

describe('createFilterHref', () => {
  it('changes only the selected filter and resets pagination', () => {
    const url = new URL(
      createFilterHref(
        '/workspace/inbox',
        'view=unread&taskId=1&page=4&status=a&status=b',
        'view',
        'all',
      ),
      'https://example.com',
    );
    expect(url.pathname).toBe('/workspace/inbox');
    expect(url.searchParams.get('view')).toBe('all');
    expect(url.searchParams.get('taskId')).toBe('1');
    expect(url.searchParams.getAll('status')).toEqual(['a', 'b']);
    expect(url.searchParams.has('page')).toBe(false);
  });
});

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
