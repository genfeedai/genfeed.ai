import { readRecordOrEmpty } from '@api/shared/utils/object/read-record-or-empty.util';
import { describe, expect, it } from 'vitest';

describe('readRecordOrEmpty', () => {
  it.each([undefined, null, true, 1, 'value', []])(
    'returns an empty record for %j',
    (value) => {
      expect(readRecordOrEmpty(value)).toEqual({});
    },
  );
});
