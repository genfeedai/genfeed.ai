import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { describe, expect, it } from 'vitest';

describe('pickDefinedFields', () => {
  it('omits undefined values and keeps null, false, and empty strings', () => {
    expect(
      pickDefinedFields(
        {
          empty: '',
          flag: false,
          missing: undefined,
          name: 'acme',
          unset: undefined,
          zero: 0,
        },
        ['empty', 'flag', 'missing', 'name', 'zero'],
      ),
    ).toEqual({
      empty: '',
      flag: false,
      name: 'acme',
      zero: 0,
    });
  });

  it('returns an empty object when every requested field is undefined', () => {
    expect(pickDefinedFields({ a: undefined }, ['a'])).toEqual({});
  });
});
