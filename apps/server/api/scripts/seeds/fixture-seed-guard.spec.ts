import { assertFixtureSeedAllowed } from '@api-scripts/seeds/fixture-seed-guard';
import { describe, expect, it } from 'vitest';

describe('assertFixtureSeedAllowed', () => {
  const localUrl = new URL(
    'postgresql://genfeed:genfeed@localhost:5432/genfeed',
  );

  it('allows a local development database', () => {
    expect(() =>
      assertFixtureSeedAllowed({ NODE_ENV: 'development' }, localUrl),
    ).not.toThrow();
  });

  it('refuses hosted cloud environments', () => {
    expect(() =>
      assertFixtureSeedAllowed(
        { GENFEED_CLOUD: 'true', NODE_ENV: 'development' },
        localUrl,
      ),
    ).toThrow('hosted cloud environment');
  });

  it('refuses production NODE_ENV', () => {
    expect(() =>
      assertFixtureSeedAllowed({ NODE_ENV: 'production' }, localUrl),
    ).toThrow('NODE_ENV=production');
  });

  it('refuses a non-local database host', () => {
    expect(() =>
      assertFixtureSeedAllowed(
        { NODE_ENV: 'development' },
        new URL('postgresql://genfeed:genfeed@db.example.com:5432/genfeed'),
      ),
    ).toThrow('non-local database host: db.example.com');
  });
});
