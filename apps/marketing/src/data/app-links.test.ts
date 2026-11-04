import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.example.test' } },
}));

import { getAppLoginUrl, getAppSignUpUrl, getAppUrl } from './app-links';

describe('app links', () => {
  it.each([
    ['sign-up', getAppSignUpUrl(), 'https://app.example.test/sign-up'],
    [
      'sign-up with a plan',
      getAppSignUpUrl('?plan=payg'),
      'https://app.example.test/sign-up?plan=payg',
    ],
    ['login', getAppLoginUrl(), 'https://app.example.test/login'],
    ['any route', getAppUrl('/connect'), 'https://app.example.test/connect'],
  ])('builds the %s URL on the app origin', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});
