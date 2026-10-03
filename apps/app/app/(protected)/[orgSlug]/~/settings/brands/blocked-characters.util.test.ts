import { describe, expect, it } from 'vitest';
import {
  BRAND_OWNS_SHARED_CHARACTERS,
  readBlockedCharacters,
} from './blocked-characters.util';

const apiError = (code: string, characters: unknown) => ({
  response: {
    data: {
      errors: [{ code, detail: 'blocked', source: { characters } }],
    },
  },
});

describe('readBlockedCharacters', () => {
  it('reads the characters that block a brand deletion', () => {
    expect(
      readBlockedCharacters(
        apiError(BRAND_OWNS_SHARED_CHARACTERS, [
          { handle: 'anna', id: 'p1', label: 'Anna' },
          { handle: null, id: 'p2', label: 'Ben' },
          { id: 3 },
        ]),
      ),
    ).toEqual([
      { handle: 'anna', id: 'p1', label: 'Anna' },
      { handle: null, id: 'p2', label: 'Ben' },
    ]);
  });

  it('ignores any other failure', () => {
    expect(readBlockedCharacters(apiError('409', []))).toEqual([]);
    expect(readBlockedCharacters(new Error('network'))).toEqual([]);
    expect(readBlockedCharacters(undefined)).toEqual([]);
  });
});
