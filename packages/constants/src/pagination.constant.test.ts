import { describe, expect, it } from 'vitest';
import { ITEMS_PER_PAGE } from './pagination.constant';

describe('pagination.constant', () => {
  it('exports ITEMS_PER_PAGE as 15', () => {
    expect(ITEMS_PER_PAGE).toBe(15);
  });
});
