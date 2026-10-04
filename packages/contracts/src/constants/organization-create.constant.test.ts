import { describe, expect, it } from 'vitest';

import { isValidWebsiteUrl } from './organization-create.constant';

describe('isValidWebsiteUrl', () => {
  it.each([
    'acme.com',
    'www.acme.co.uk',
    'https://acme.com',
    'http://acme.com/about?ref=1',
    '  acme.io  ',
    'xn--80ak6aa92e.xn--p1ai',
  ])('accepts %s', (value) => {
    expect(isValidWebsiteUrl(value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'acme',
    'localhost',
    'not a site',
    'ftp://acme.com',
    'javascript:alert(1)',
    'https://acme',
    'acme.c',
  ])('rejects %s', (value) => {
    expect(isValidWebsiteUrl(value)).toBe(false);
  });
});
