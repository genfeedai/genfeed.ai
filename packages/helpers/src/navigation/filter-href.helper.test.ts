import { describe, expect, it } from 'vitest';
import { createFilterHref } from './filter-href.helper';

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
