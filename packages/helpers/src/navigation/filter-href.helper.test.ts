import { describe, expect, it } from 'vitest';
import { createFilterHref } from './filter-href.helper';

describe('createFilterHref', () => {
  it('changes only the selected filter and resets pagination', () => {
    const url = new URL(
      createFilterHref(
        '/workspace/inbox',
        'status=unread&taskId=1&page=4&tag=a&tag=b',
        'status',
        'all',
      ),
      'https://example.com',
    );
    expect(url.pathname).toBe('/workspace/inbox');
    expect(url.searchParams.get('status')).toBe('all');
    expect(url.searchParams.get('taskId')).toBe('1');
    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(url.searchParams.has('page')).toBe(false);
  });
});
