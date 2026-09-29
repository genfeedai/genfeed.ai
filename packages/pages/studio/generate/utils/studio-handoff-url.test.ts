import { describe, expect, it } from 'vitest';
import { parseStudioHandoffId } from './studio-handoff-url';

describe('parseStudioHandoffId', () => {
  it('restores one opaque handoff id from the Studio URL', () => {
    expect(
      parseStudioHandoffId(new URLSearchParams('handoff=hnd_01.ab-c')),
    ).toBe('hnd_01.ab-c');
  });
});
