import { describe, expect, it } from 'bun:test';

import { formatStorageBytes } from './library-storage.util';

describe('formatStorageBytes', () => {
  it('renders an empty library as zero bytes', () => {
    expect(formatStorageBytes(0)).toBe('0 B');
  });

  it('guards against negative and non-finite totals', () => {
    expect(formatStorageBytes(-1)).toBe('0 B');
    expect(formatStorageBytes(Number.NaN)).toBe('0 B');
  });

  it('keeps bytes and kilobytes whole', () => {
    expect(formatStorageBytes(512)).toBe('512 B');
    expect(formatStorageBytes(1024)).toBe('1 KB');
    expect(formatStorageBytes(1536)).toBe('2 KB');
  });

  it('keeps one decimal from megabytes up', () => {
    expect(formatStorageBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatStorageBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
  });

  it('stops at terabytes rather than inventing a unit', () => {
    expect(formatStorageBytes(1024 ** 5)).toBe('1024.0 TB');
  });
});
