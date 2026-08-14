import { describe, expect, it } from 'vitest';
import { POST_QUICK_ACTIONS } from './post-quick-actions.constant';

describe('POST_QUICK_ACTIONS', () => {
  it('exposes unique keys with non-empty labels and prompts', () => {
    const keys = POST_QUICK_ACTIONS.map((action) => action.key);

    expect(keys).toEqual(['shorten', 'simplify', 'boost']);
    expect(new Set(keys).size).toBe(keys.length);

    for (const action of POST_QUICK_ACTIONS) {
      expect(action.label.trim().length).toBeGreaterThan(0);
      expect(action.prompt.trim().length).toBeGreaterThan(0);
    }
  });
});
