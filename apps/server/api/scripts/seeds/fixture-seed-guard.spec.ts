import { describe, expect, it } from 'vitest';
import { assertFixtureSeedAllowed } from './fixture-seed-guard';

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

  it('refuses an environment on a *.genfeed.ai host without any flag', () => {
    expect(() =>
      assertFixtureSeedAllowed(
        {
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          NODE_ENV: 'development',
        },
        localUrl,
      ),
    ).toThrow('hosted cloud environment');
  });

  it('allows an explicit self-hosted flag against a local database', () => {
    expect(() =>
      assertFixtureSeedAllowed(
        { GENFEED_CLOUD: 'false', NODE_ENV: 'development' },
        localUrl,
      ),
    ).not.toThrow();
  });

  it('refuses production NODE_ENV even when only the Cloud flag is set', () => {
    expect(() =>
      assertFixtureSeedAllowed(
        { GENFEED_CLOUD: 'true', NODE_ENV: 'production' },
        localUrl,
      ),
    ).toThrow('NODE_ENV=production');
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
