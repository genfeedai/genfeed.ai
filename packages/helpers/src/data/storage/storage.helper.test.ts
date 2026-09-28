import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readLocalStorageItem,
  readLocalStorageStringArray,
  writeLocalStorageItem,
  writeLocalStorageStringArray,
} from './storage.helper';

function storageWith(value: string | null) {
  const storage = { getItem: vi.fn(() => value), setItem: vi.fn() };
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('browser storage helpers', () => {
  it('returns empty values and skips writes during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(readLocalStorageItem('key')).toBeNull();
    expect(readLocalStorageStringArray('key')).toEqual([]);
    expect(() => writeLocalStorageItem('key', 'value')).not.toThrow();
    expect(() => writeLocalStorageStringArray('key', ['value'])).not.toThrow();
  });

  it('preserves raw preference strings', () => {
    const storage = storageWith('false');
    expect(readLocalStorageItem('key')).toBe('false');
    writeLocalStorageItem('key', 'grid');
    expect(storage.setItem).toHaveBeenCalledWith('key', 'grid');
  });

  it('filters array values without changing ordering or duplicates', () => {
    const storage = storageWith('["a",42,null,"b","a"]');
    expect(readLocalStorageStringArray('key')).toEqual(['a', 'b', 'a']);
    writeLocalStorageStringArray('key', ['b', 'a']);
    expect(storage.setItem).toHaveBeenCalledWith('key', '["b","a"]');
  });

  it.each([null, '', 'invalid JSON', '{}', 'true', 'null'])(
    'ignores invalid stored model keys: %s',
    (value) => {
      storageWith(value);
      expect(readLocalStorageStringArray('key')).toEqual([]);
    },
  );

  it('keeps raw storage failures observable while model lists remain optional', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage unavailable');
      },
    });
    expect(() => readLocalStorageItem('key')).toThrow('storage unavailable');
    expect(() => writeLocalStorageItem('key', 'value')).toThrow(
      'storage unavailable',
    );
    expect(readLocalStorageStringArray('key')).toEqual([]);
    expect(() => writeLocalStorageStringArray('key', ['a'])).not.toThrow();
  });
});
