import {
  INTERNAL_CALLERS,
  internalCallerKeyName,
  resolveAcceptedInternalCallerKeys,
  resolveInternalCallerKey,
} from '@libs/auth/internal-caller-keys';
import { describe, expect, it } from 'vitest';

const reader = (keys: Record<string, string | undefined>) => (key: string) =>
  keys[key];

describe('internal caller keys', () => {
  it('names every caller key GENFEEDAI_API_KEY_<CALLER>', () => {
    for (const caller of INTERNAL_CALLERS) {
      expect(internalCallerKeyName(caller)).toBe(
        `GENFEEDAI_API_KEY_${caller.toUpperCase()}`,
      );
    }
  });

  it('prefers the caller key and falls back to the shared key', () => {
    const read = reader({
      GENFEEDAI_API_KEY: 'shared',
      GENFEEDAI_API_KEY_DISCORD: ' own ',
    });

    expect(resolveInternalCallerKey(read, 'discord')).toBe('own');
    expect(resolveInternalCallerKey(read, 'slack')).toBe('shared');
  });

  it('treats a blank caller key as unset and returns "" when nothing is set', () => {
    expect(
      resolveInternalCallerKey(
        reader({ GENFEEDAI_API_KEY: 'shared', GENFEEDAI_API_KEY_FILES: ' ' }),
        'files',
      ),
    ).toBe('shared');
    expect(resolveInternalCallerKey(reader({}), 'files')).toBe('');
  });

  it('accepts only the keys of the callers a route allows', () => {
    const read = reader({
      GENFEEDAI_API_KEY_DISCORD: 'd',
      GENFEEDAI_API_KEY_SLACK: 's',
      GENFEEDAI_API_KEY_TELEGRAM: 't',
    });

    expect(
      resolveAcceptedInternalCallerKeys(read, ['discord', 'slack']),
    ).toEqual(['d', 's']);
    expect(resolveAcceptedInternalCallerKeys(read, ['files'])).toEqual([]);
  });
});
