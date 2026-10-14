import { describe, expect, it, vi } from 'vitest';
import { prepareLocalDatabase } from './dev/prepare-local-database';

describe('prepareLocalDatabase', () => {
  const localEnv = {
    DATABASE_URL: 'postgresql://genfeed:genfeed@localhost:5432/genfeed',
    NODE_ENV: 'development',
  };

  it('runs migrate, generate, then reference-data sync on the default path', () => {
    const runCommand = vi.fn();
    const runReferenceDataSync = vi.fn();
    prepareLocalDatabase(
      '/workspace',
      localEnv,
      runCommand,
      runReferenceDataSync,
    );
    expect(runCommand.mock.calls).toEqual([
      [['migrate', 'deploy']],
      [['generate']],
    ]);
    expect(runReferenceDataSync).toHaveBeenCalledWith(localEnv);
  });

  it('skips the reference-data sync when tests pass only a custom runCommand', () => {
    const runCommand = vi.fn();
    prepareLocalDatabase('/workspace', localEnv, runCommand);
    expect(runCommand).toHaveBeenCalledTimes(2);
  });
});
