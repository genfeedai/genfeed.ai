import { readRecordOrEmpty } from '@api/shared/utils/object/read-record-or-empty.util';
import { describe, expect, it } from 'vitest';

describe('readRecordOrEmpty', () => {
  it('returns the original non-array object record', () => {
    const record = { id: 'record_1' };

    expect(readRecordOrEmpty(record)).toBe(record);
  });

  it.each([undefined, null, true, 1, 'value', []])(
    'returns an empty record for %j',
    (value) => {
      expect(readRecordOrEmpty(value)).toEqual({});
    },
  );
});
