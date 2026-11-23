// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOOT_RECORD_MAX_AGE_MS,
  BOOT_RECORD_STORAGE_KEY,
  clearBootRecord,
  parseBootRecord,
  readBootRecordText,
  readBootRecordUserId,
  writeBootRecord,
} from '@/lib/boot-record/boot-record';
import { createBootRecord } from '@/lib/boot-record/boot-record.fixture';
import type { BootRecord } from '@/props/layout/boot-record.props';

const NOW = 1_800_000_000_000;

function record(overrides: Partial<BootRecord> = {}): BootRecord {
  return createBootRecord({
    buildId: 'build-1',
    savedAt: NOW,
    ...overrides,
  });
}

describe('boot record', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reads back what was written, for this build, inside the age limit', () => {
    writeBootRecord(record());

    expect(
      parseBootRecord(readBootRecordText(), { buildId: 'build-1', now: NOW }),
    ).toEqual(record());
  });

  it('is no record for another build', () => {
    writeBootRecord(record());

    expect(
      parseBootRecord(readBootRecordText(), { buildId: 'build-2', now: NOW }),
    ).toBeNull();
  });

  it('is no record past the age limit, and still one at the limit', () => {
    writeBootRecord(record());
    const text = readBootRecordText();

    expect(
      parseBootRecord(text, {
        buildId: 'build-1',
        now: NOW + BOOT_RECORD_MAX_AGE_MS,
      }),
    ).not.toBeNull();
    expect(
      parseBootRecord(text, {
        buildId: 'build-1',
        now: NOW + BOOT_RECORD_MAX_AGE_MS + 1,
      }),
    ).toBeNull();
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', '{oops'],
    ['JSON that is not an object', '"text"'],
    ['an object without a rail', JSON.stringify({ ...record(), rail: null })],
    [
      'a rail whose app lists are not lists',
      JSON.stringify({
        ...record(),
        rail: { ...record().rail, pinnedAppIds: 3 },
      }),
    ],
  ])('is no record for %s', (_label, text) => {
    expect(parseBootRecord(text, { buildId: 'build-1', now: NOW })).toBeNull();
  });

  it('names whose record is stored, even one that is too old to use', () => {
    writeBootRecord(record({ savedAt: NOW - 10 * BOOT_RECORD_MAX_AGE_MS }));

    expect(readBootRecordUserId()).toBe('user-1');
  });

  it('removes the record', () => {
    writeBootRecord(record());
    clearBootRecord();

    expect(window.localStorage.getItem(BOOT_RECORD_STORAGE_KEY)).toBeNull();
    expect(readBootRecordUserId()).toBeNull();
  });

  it('keeps no key, token or personal field: only what the rail needs', () => {
    writeBootRecord(record());

    expect(
      Object.keys(JSON.parse(readBootRecordText() ?? '{}')).sort(),
    ).toEqual([
      'buildId',
      'organizationId',
      'organizationSlug',
      'rail',
      'savedAt',
      'sessionTag',
      'userId',
    ]);
  });
});
