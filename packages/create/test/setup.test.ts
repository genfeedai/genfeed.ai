import { describe, expect, it } from 'vitest';
import { resolveSetupEnvironment } from '../src/setup.js';

describe('self-hosted setup', () => {
  it.each(['0', '65536', '3000\nOTHER=value'])(
    'rejects invalid host ports before writing env',
    (port) => {
      expect(() =>
        resolveSetupEnvironment({
          OPENROUTER_API_KEY: 'sk-or-offline-fixture',
          SELFHOSTED_APP_PORT: port,
        }),
      ).toThrow('SELFHOSTED_APP_PORT');
    },
  );
  it.each([
    '',
    'your_key_here',
    'PLACEHOLDER_NOT_CONFIGURED',
    'sk-or-...',
    'changeme',
  ])('rejects an unconfigured key without echoing it', (key) => {
    expect(() => resolveSetupEnvironment({ OPENROUTER_API_KEY: key })).toThrow(
      'OPENROUTER_API_KEY',
    );
  });

  it('derives local public endpoints from host ports', () => {
    expect(
      resolveSetupEnvironment({
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        SELFHOSTED_APP_PORT: '4300',
      }),
    ).toMatchObject({
      GENFEEDAI_PUBLIC_URL: 'http://localhost:4300',
      GENFEEDAI_API_PUBLIC_URL: 'http://localhost:3010',
      BETTER_AUTH_URL: 'http://localhost:3010',
      BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:4300',
    });
  });

  it('derives same-origin auth and public URLs for an owned domain', () => {
    expect(
      resolveSetupEnvironment({
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        SELFHOSTED_DOMAIN: 'studio.example.com',
      }),
    ).toMatchObject({
      GENFEEDAI_PUBLIC_URL: 'https://studio.example.com',
      GENFEEDAI_API_PUBLIC_URL: 'https://studio.example.com',
      BETTER_AUTH_URL: 'https://studio.example.com',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://studio.example.com',
    });
  });

  it.each(['BETTER_AUTH_URL', 'BETTER_AUTH_TRUSTED_ORIGINS'])(
    'rejects local %s on a public domain',
    (variable) => {
      expect(() =>
        resolveSetupEnvironment({
          OPENROUTER_API_KEY: 'sk-or-offline-fixture',
          GENFEEDAI_PUBLIC_URL: 'https://studio.example.com',
          [variable]: 'http://localhost:3010',
        }),
      ).toThrow(new RegExp(`GENFEEDAI_PUBLIC_URL.*${variable}`));
    },
  );

  it('rejects a credential-bearing domain without disclosing it', () => {
    expect(() =>
      resolveSetupEnvironment({
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        SELFHOSTED_DOMAIN: 'https://secret@example.com',
      }),
    ).toThrow('SELFHOSTED_DOMAIN must');
  });
});
