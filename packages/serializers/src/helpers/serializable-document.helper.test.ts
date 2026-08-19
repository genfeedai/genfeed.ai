import {
  readJsonRecord,
  toIdString,
  toSerializableDocument,
} from '@serializers/helpers/serializable-document.helper';
import { describe, expect, it } from 'vitest';

describe('toSerializableDocument', () => {
  it('returns an empty record for non-objects', () => {
    expect(toSerializableDocument(null)).toEqual({});
    expect(toSerializableDocument('playbook')).toEqual({});
  });

  it('unwraps a toObject() document', () => {
    expect(
      toSerializableDocument({
        toObject: () => ({ id: 'playbook-1', name: 'Hooks' }),
      }),
    ).toEqual({ id: 'playbook-1', name: 'Hooks' });
  });

  it('returns an empty record when toObject() is not an object', () => {
    expect(toSerializableDocument({ toObject: () => 'nope' })).toEqual({});
  });
});

describe('readJsonRecord', () => {
  it('returns the object as-is and rejects arrays', () => {
    expect(readJsonRecord({ name: 'Hooks' })).toEqual({ name: 'Hooks' });
    expect(readJsonRecord(['Hooks'])).toEqual({});
    expect(readJsonRecord(null)).toEqual({});
  });
});

describe('toIdString', () => {
  it('stringifies primitive ids and omits nullish values', () => {
    expect(toIdString('playbook-1')).toBe('playbook-1');
    expect(toIdString(12)).toBe('12');
    expect(toIdString(true)).toBe('true');
    expect(toIdString(null)).toBeUndefined();
    expect(toIdString(undefined)).toBeUndefined();
  });

  it('uses object toString() when present', () => {
    expect(toIdString({ toString: () => 'object-id' })).toBe('object-id');
  });
});
