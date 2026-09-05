import { describe, expect, it } from 'vitest';
import { parseCredentialBackfillArgs } from './credential-encryption-backfill';

describe('credential encryption backfill arguments', () => {
  it('defaults to a read-only dry run', () => {
    expect(parseCredentialBackfillArgs([])).toEqual({
      dryRun: true,
      batchSize: 100,
    });
    expect(parseCredentialBackfillArgs(['--live', '--batch=5000'])).toEqual({
      dryRun: false,
      batchSize: 5000,
    });
  });
  it.each([
    '--batch=0',
    '--batch=-1',
    '--batch=NaN',
    '--batch=5junk',
    '--batch=5001',
    '--batch=1.5',
    '--unknown',
  ])('rejects invalid input %s before connecting', (arg) => {
    expect(() => parseCredentialBackfillArgs([arg])).toThrow();
  });
  it('rejects conflicting write intent', () => {
    expect(() => parseCredentialBackfillArgs(['--live', '--dry-run'])).toThrow(
      'Choose either',
    );
  });
});
