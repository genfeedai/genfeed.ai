import { describe, expect, it } from 'vitest';
import { statusBadge, statusIcon } from './status-colors';

describe('status color contract', () => {
  it('keeps tone and glyph coverage in lockstep', () => {
    expect(Object.keys(statusIcon).sort()).toEqual(
      Object.keys(statusBadge).sort(),
    );
  });
});
