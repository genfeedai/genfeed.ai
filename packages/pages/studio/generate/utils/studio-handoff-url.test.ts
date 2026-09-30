import { describe, expect, it } from 'vitest';
import { parseStudioHandoffId } from './studio-handoff-url';

describe('parseStudioHandoffId', () => {
  it('restores one opaque handoff id from the Studio URL', () => {
    expect(
      parseStudioHandoffId(new URLSearchParams('handoff=hnd_01.ab-c')),
    ).toBe('hnd_01.ab-c');
  });

  it('rejects copied briefs, urls, and malformed identifiers', () => {
    expect(
      parseStudioHandoffId(
        new URLSearchParams('handoff=https%3A%2F%2Fexample.com%2Fh%2F1'),
      ),
    ).toBeNull();
    expect(
      parseStudioHandoffId(
        new URLSearchParams('handoff=%7B%22objective%22%3A%22copied%22%7D'),
      ),
    ).toBeNull();
    expect(parseStudioHandoffId(new URLSearchParams('handoff='))).toBeNull();
  });

  it('returns null when the query param is absent', () => {
    expect(parseStudioHandoffId(new URLSearchParams(''))).toBeNull();
  });
});
