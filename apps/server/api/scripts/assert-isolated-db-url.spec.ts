import { describe, expect, it } from 'vitest';
import { assertIsolatedDatabaseUrl } from './assert-isolated-db-url';

describe('assertIsolatedDatabaseUrl', () => {
  it('accepts the CI disposable Postgres URL', () => {
    expect(
      assertIsolatedDatabaseUrl(
        'postgresql://genfeed:genfeed_local@localhost:5432/test',
      ),
    ).toBe('postgresql://genfeed:genfeed_local@localhost:5432/test');
  });

  it('accepts the local genfeedai_test fallback URL', () => {
    expect(
      assertIsolatedDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5432/genfeedai_test',
      ),
    ).toBe('postgresql://postgres:postgres@localhost:5432/genfeedai_test');
  });

  it('fails closed when DATABASE_URL is missing', () => {
    expect(() => assertIsolatedDatabaseUrl(undefined)).toThrow(
      /DATABASE_URL is missing/,
    );
    expect(() => assertIsolatedDatabaseUrl('')).toThrow(
      /DATABASE_URL is missing/,
    );
  });

  it('fails closed when DATABASE_URL is not a valid URL', () => {
    expect(() => assertIsolatedDatabaseUrl('not-a-url')).toThrow(
      /DATABASE_URL is not a valid URL/,
    );
  });

  it('refuses a production-shaped host instead of falling back', () => {
    expect(() =>
      assertIsolatedDatabaseUrl(
        'postgresql://genfeed:secret@ep-prod.neon.tech/genfeed',
      ),
    ).toThrow(/not a disposable local database/);
  });

  it('refuses a local host whose database name is not a test database', () => {
    expect(() =>
      assertIsolatedDatabaseUrl(
        'postgresql://genfeed:genfeed_local@localhost:5432/genfeed',
      ),
    ).toThrow(/does not look like a disposable test database/);
  });
});
