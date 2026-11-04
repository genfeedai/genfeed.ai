import {
  findSelfHostedConfigIssues,
  type SelfHostedConfigInput,
} from '@api/services/selfhosted-readiness/selfhosted-config-issues.util';
import { describe, expect, it } from 'vitest';

const LOCAL_INSTALL: SelfHostedConfigInput = {
  apiPublicUrl: 'http://localhost:3010',
  appPublicUrl: 'http://localhost:3000',
  authSecret: 'a-real-generated-secret-value',
  authTrustedOrigins: 'http://localhost:3000',
  authUrl: 'http://localhost:3010',
  isAuthEnabled: true,
  openRouterApiKey: 'sk-or-v1-abcdef0123456789',
};

const DOMAIN_INSTALL: SelfHostedConfigInput = {
  ...LOCAL_INSTALL,
  apiPublicUrl: 'https://genfeed.example.org',
  appPublicUrl: 'https://genfeed.example.org',
  authTrustedOrigins: 'https://genfeed.example.org',
  authUrl: 'https://genfeed.example.org',
};

describe('findSelfHostedConfigIssues', () => {
  it('reports nothing for a configured localhost install', () => {
    expect(findSelfHostedConfigIssues(LOCAL_INSTALL)).toEqual([]);
  });

  it('reports nothing for a configured domain install', () => {
    expect(findSelfHostedConfigIssues(DOMAIN_INSTALL)).toEqual([]);
  });

  it('accepts the offline CI fixture key', () => {
    expect(
      findSelfHostedConfigIssues({
        ...LOCAL_INSTALL,
        openRouterApiKey: 'sk-or-offline-fixture',
      }),
    ).toEqual([]);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['not an OpenRouter key', 'sk-ant-api03-abcdefghij'],
    ['a placeholder', 'sk-or-your-key-here'],
    ['too short', 'sk-or-abc'],
  ])('names OPENROUTER_API_KEY when it is %s', (_label, openRouterApiKey) => {
    const issues = findSelfHostedConfigIssues({
      ...LOCAL_INSTALL,
      openRouterApiKey,
    });

    expect(issues.map((issue) => issue.variable)).toEqual([
      'OPENROUTER_API_KEY',
    ]);
  });

  it('never echoes the OpenRouter key', () => {
    const issues = findSelfHostedConfigIssues({
      ...LOCAL_INSTALL,
      openRouterApiKey: 'sk-or-your-key-here',
    });

    expect(JSON.stringify(issues)).not.toContain('sk-or-your-key-here');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['the .env.example placeholder', 'replace_with_a_long_random_secret'],
  ])('names BETTER_AUTH_SECRET when it is %s', (_label, authSecret) => {
    const issues = findSelfHostedConfigIssues({
      ...LOCAL_INSTALL,
      authSecret,
    });

    expect(issues.map((issue) => issue.variable)).toEqual([
      'BETTER_AUTH_SECRET',
    ]);
  });

  it('names both values when the public URL is a domain but auth still says localhost', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      authUrl: 'http://localhost:3010',
    });

    expect(issues).toEqual([
      {
        message:
          'GENFEEDAI_PUBLIC_URL=https://genfeed.example.org but BETTER_AUTH_URL=http://localhost:3010; sign-in from the public address will fail.',
        variable: 'BETTER_AUTH_URL',
      },
    ]);
  });

  it('flags an unset auth URL behind a public API origin', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      appPublicUrl: 'http://localhost:3000',
      authTrustedOrigins: 'http://localhost:3000',
      authUrl: undefined,
    });

    expect(issues.map((issue) => issue.variable)).toEqual(['BETTER_AUTH_URL']);
  });

  it('flags trusted origins that still say localhost behind a public app URL', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      authTrustedOrigins: 'http://localhost:3000',
    });

    expect(issues).toEqual([
      {
        message:
          "GENFEEDAI_PUBLIC_URL=https://genfeed.example.org is not among BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000; the browser's sign-in request will be rejected.",
        variable: 'BETTER_AUTH_TRUSTED_ORIGINS',
      },
    ]);
  });

  it('does not echo credentials embedded in a URL', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      authUrl: 'http://admin:hunter2@localhost:3010',
    });

    expect(JSON.stringify(issues)).not.toContain('hunter2');
  });

  it('skips every auth check when sign-in is disabled', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      authSecret: '',
      authTrustedOrigins: undefined,
      authUrl: 'http://localhost:3010',
      isAuthEnabled: false,
    });

    expect(issues).toEqual([]);
  });

  it('reports generation and auth problems together', () => {
    const issues = findSelfHostedConfigIssues({
      ...DOMAIN_INSTALL,
      authSecret: '',
      authUrl: 'http://localhost:3010',
      openRouterApiKey: '',
    });

    expect(issues.map((issue) => issue.variable)).toEqual([
      'OPENROUTER_API_KEY',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
    ]);
  });
});
