import { describe, expect, it } from 'vitest';
import {
  NODE_COLOR_LABELS,
  NODE_COLOR_VALUES,
  NODE_COLORS,
  type NodeColor,
} from './colors';

describe('workflow node colors', () => {
  it('keeps palette keys, labels, and values aligned', () => {
    expect(new Set(NODE_COLORS)).toEqual(
      new Set(Object.keys(NODE_COLOR_VALUES)),
    );
    expect(new Set(Object.keys(NODE_COLOR_LABELS))).toEqual(
      new Set(NODE_COLORS),
    );

    for (const color of NODE_COLORS) {
      const typed = color as NodeColor;
      if (typed === 'none') {
        expect(NODE_COLOR_VALUES[typed]).toBeNull();
      } else {
        expect(NODE_COLOR_VALUES[typed]).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(NODE_COLOR_LABELS[typed].length).toBeGreaterThan(0);
    }
  });
});
