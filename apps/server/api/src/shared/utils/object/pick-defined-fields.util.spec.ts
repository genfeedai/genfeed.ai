import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { describe, expect, it } from 'vitest';

describe('pickDefinedFields', () => {
  it('returns an empty object when every requested field is undefined', () => {
    expect(pickDefinedFields({ a: undefined }, ['a'])).toEqual({});
  });
});
