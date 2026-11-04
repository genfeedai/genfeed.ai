import {
  resolveAcceptedInternalCallerKeys,
  resolveInternalCallerKey,
} from '@libs/auth/internal-caller-keys';
import { describe, expect, it } from 'vitest';

const reader = (keys: Record<string, string | undefined>) => (key: string) =>
  keys[key];

describe('internal caller keys', () => {
  it('resolves each caller to its own key', () => {
    const read = reader({
      GENFEEDAI_API_KEY_DISCORD: 'd',
      GENFEEDAI_API_KEY_FILES: 'f',
      GENFEEDAI_API_KEY_NOTIFICATIONS: 'n',
      GENFEEDAI_API_KEY_SLACK: 's',
      GENFEEDAI_API_KEY_TELEGRAM: 't',
    });

    expect(resolveInternalCallerKey(read, 'discord')).toBe('d');
    expect(resolveInternalCallerKey(read, 'files')).toBe('f');
    expect(resolveInternalCallerKey(read, 'notifications')).toBe('n');
    expect(resolveInternalCallerKey(read, 'slack')).toBe('s');
    expect(resolveInternalCallerKey(read, 'telegram')).toBe('t');
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
