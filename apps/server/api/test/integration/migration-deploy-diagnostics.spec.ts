import { formatMigrationDeployDiagnostic } from '@api-test/helpers/migration-deploy-diagnostics';
import { describe, expect, it, vi } from 'vitest';

function syntheticDatabaseUrl(): URL {
  const url = new URL('postgresql://fixture.invalid/test_database');
  url.username = 'fixture-user';
  url.password = 'fixture-secret with spaces/%';
  url.searchParams.set('schema', 'owned_fixture');
  return url;
}

const diagnostic = (error: unknown, url = syntheticDatabaseUrl()): unknown =>
  JSON.parse(formatMigrationDeployDiagnostic(error, url.toString()));

describe('migration deployment diagnostics', () => {
  it('retains constrained process metadata and PostgreSQL migration text from string and Buffer streams', () => {
    expect(
      diagnostic({
        code: 1,
        signal: 'SIGTERM',
        killed: true,
        stdout: 'Applying migration 20261001_fixture',
        stderr: Buffer.from(
          'P3018 PostgreSQL error 42883: function digest does not exist',
        ),
      }),
    ).toEqual({
      version: 1,
      code: 'MIGRATION_DEPLOY_FAILED',
      exitCode: 1,
      processCode: null,
      signal: 'SIGTERM',
      killed: true,
      stdout: {
        text: 'Applying migration 20261001_fixture',
        truncated: false,
        omitted: false,
      },
      stderr: {
        text: 'P3018 PostgreSQL error 42883: function digest does not exist',
        truncated: false,
        omitted: false,
      },
    });
    expect(
      diagnostic({ code: 'ETIMEDOUT', signal: null, killed: false }),
    ).toMatchObject({
      exitCode: null,
      processCode: 'ETIMEDOUT',
      signal: null,
      killed: false,
    });
  });

  it.each([
    { code: Number.NaN, signal: 'SIGTERM secret', killed: 'true' },
    { code: Number.MAX_SAFE_INTEGER + 1, signal: 'SECRET', killed: 1 },
    { code: 'unsafe process text', signal: `SIG${'A'.repeat(21)}`, killed: {} },
    { code: 'A'.repeat(65), signal: {}, killed: null },
  ])('rejects unconstrained process metadata (%j)', (input) => {
    expect(diagnostic(input)).toMatchObject({
      exitCode: null,
      processCode: null,
      signal: null,
      killed: null,
    });
  });

  it('retains only the sanitized 8192-byte tail and marks truncation explicitly', () => {
    expect(
      diagnostic({ stderr: `discarded-prefix-${'x'.repeat(8192)}` }),
    ).toMatchObject({
      stderr: { text: 'x'.repeat(8192), truncated: true, omitted: false },
    });
    expect(diagnostic({ stdout: Buffer.alloc(8192, 'y') })).toMatchObject({
      stdout: { text: 'y'.repeat(8192), truncated: false, omitted: false },
    });
  });

  it('omits streams larger than the bounded eight MiB input limit', () => {
    expect(
      diagnostic({
        stdout: 'x'.repeat(8 * 1024 * 1024 + 1),
        stderr: Buffer.alloc(8 * 1024 * 1024 + 1),
      }),
    ).toMatchObject({
      stdout: { text: '', truncated: true, omitted: true },
      stderr: { text: '', truncated: true, omitted: true },
    });
  });

  it('redacts exact URLs, encoded and decoded passwords and generic URI userinfo before tail retention', () => {
    const url = syntheticDatabaseUrl();
    const decoded = decodeURIComponent(url.password);
    const other = new URL('https://remote.invalid/path');
    other.username = 'synthetic-remote-user';
    other.password = 'synthetic-remote-password';
    const output = formatMigrationDeployDiagnostic(
      {
        stdout: `${url.toString()} ${url.password} ${decoded} ${other.toString()}`,
        stderr: `${'x'.repeat(8190)}${decoded} migration failed`,
      },
      url.toString(),
    );
    for (const secret of [
      url.toString(),
      url.password,
      decoded,
      other.username,
      other.password,
    ])
      expect(output).not.toContain(secret);
    expect(output).toContain('[redacted]');
    expect(output).toContain('migration failed');
    expect(output).toContain('remote.invalid/path');
  });

  it('does not serialize arbitrary Error fields or invoke own accessors', () => {
    const unsafe = 'synthetic-private-field';
    const error = Object.assign(new Error(unsafe), {
      code: 1,
      stdout: 'safe stdout',
      cmd: unsafe,
      env: { PRIVATE: unsafe },
      cause: new Error(unsafe),
      custom: unsafe,
    });
    const output = formatMigrationDeployDiagnostic(
      error,
      syntheticDatabaseUrl().toString(),
    );
    expect(output).not.toContain(unsafe);
    expect(output).not.toContain('stack');
    expect(output).not.toContain('cmd');
    expect(output).not.toContain('env');
    const getter = vi.fn(() => {
      throw new Error('getter invoked');
    });
    const accessors = Object.defineProperties(
      {},
      Object.fromEntries(
        ['code', 'signal', 'killed', 'stdout', 'stderr'].map((key) => [
          key,
          { get: getter },
        ]),
      ),
    );
    expect(diagnostic(accessors)).toMatchObject({
      exitCode: null,
      processCode: null,
      signal: null,
      killed: null,
      stdout: { text: '', truncated: false, omitted: false },
      stderr: { text: '', truncated: false, omitted: false },
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'failure', 1, true])(
    'safely formats malformed error value %s',
    (input) => {
      expect(diagnostic(input)).toMatchObject({
        version: 1,
        code: 'MIGRATION_DEPLOY_FAILED',
        exitCode: null,
        processCode: null,
      });
    },
  );

  it('retains the diagnostic with a malformed percent-encoded password', () => {
    const url = syntheticDatabaseUrl();
    url.password = 'fixture%ZZ';
    const output = formatMigrationDeployDiagnostic(
      { code: 1, stderr: `${url.password} ${url.toString()} migration failed` },
      url.toString(),
    );
    expect(output).not.toContain(url.password);
    expect(output).not.toContain(url.toString());
    expect(output).toContain('migration failed');
    expect(output).toContain('MIGRATION_DEPLOY_FAILED');
  });

  it('leaves input values and bytes unchanged', () => {
    const stderr = Buffer.from('migration failed');
    const error = Object.freeze({
      code: 1,
      stderr,
      stdout: 'applying migration',
    });
    const descriptors = Object.getOwnPropertyDescriptors(error);
    const originalBytes = Buffer.from(stderr);
    diagnostic(error);
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(descriptors);
    expect(stderr).toEqual(originalBytes);
    expect(error.stdout).toBe('applying migration');
  });
});
