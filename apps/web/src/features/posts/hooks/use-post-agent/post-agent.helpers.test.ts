import { describe, expect, it } from 'vitest';
import { applyAgentTextToPost } from './post-agent.helpers';

describe('applyAgentTextToPost', () => {
  it.each([
    {
      expected: '<p>New hook</p><p>Second line</p>',
      name: 'replaces the whole post',
      payload: { mode: 'append' as const, text: 'New hook\n\nSecond line' },
    },
    {
      expected: '<p>Sharper opener and the rest</p>',
      name: 'replaces only the selected words',
      payload: {
        mode: 'replace-selection' as const,
        selectedText: 'Old opener',
        text: 'Sharper opener',
      },
    },
    {
      expected: '<p>Tom &amp; Jerry and the rest</p>',
      name: 'escapes the replacement',
      payload: {
        mode: 'replace-selection' as const,
        selectedText: 'Old opener',
        text: 'Tom & Jerry',
      },
    },
    {
      expected: '<p>Fresh copy</p>',
      name: 'replaces the post when the selection is no longer there',
      payload: {
        mode: 'replace-selection' as const,
        selectedText: 'Gone text',
        text: 'Fresh copy',
      },
    },
  ])('$name', ({ expected, payload }) => {
    expect(
      applyAgentTextToPost('<p>Old opener and the rest</p>', payload),
    ).toBe(expected);
  });
});
