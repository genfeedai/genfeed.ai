import { describe, expect, it } from 'vitest';
import { isValidOnboardingLink, toOnboardingLink } from './first-drafts.util';

describe('isValidOnboardingLink', () => {
  it.each([
    'acme.co',
    'https://www.acme.com/about',
    'http://acme.io?ref=x',
    '@acme',
    'shop.natural-pet.supply',
    'bücher.de',
  ])('accepts %s', (link) => {
    expect(isValidOnboardingLink(link)).toBe(true);
  });

  it.each([
    '',
    'na',
    'https://na/',
    'rassen,tech',
    'my site.com',
    'localhost',
    'acme.',
    'acme.c',
    'https://',
  ])('rejects %j', (link) => {
    expect(isValidOnboardingLink(link)).toBe(false);
  });
});

describe('toOnboardingLink', () => {
  it('turns a bare handle into an X profile link', () => {
    expect(toOnboardingLink(' @acme ')).toBe('https://x.com/acme');
  });
});
