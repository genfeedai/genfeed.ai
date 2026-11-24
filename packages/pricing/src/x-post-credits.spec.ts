import { describe, expect, it } from 'vitest';
import {
  X_POST_CREDIT_COST,
  X_POST_WITH_URL_CREDIT_COST,
  xPostCreditCost,
  xPostHasLink,
} from './x-post-credits';

describe('xPostHasLink', () => {
  it.each([
    'Read it at https://genfeed.ai/blog today',
    'http://example.org',
    'see www.example.com',
    'try genfeed.ai now',
    '<p>Read <a href="https://genfeed.ai">this</a></p>',
    '<p>shop at mystore.shop/drop</p>',
  ])('counts %j as a link', (text) => {
    expect(xPostHasLink(text)).toBe(true);
  });

  it.each([
    '',
    null,
    undefined,
    'Plain post about content.',
    'We use node.js and e.g. TypeScript.',
    'Write to me@site.com',
    '<p>Hello <strong>world</strong></p>',
    'Version 2.5 ships today.',
  ])('does not count %j as a link', (text) => {
    expect(xPostHasLink(text)).toBe(false);
  });
});

describe('xPostCreditCost', () => {
  it('prices a plain post at the base cost', () => {
    expect(xPostCreditCost('No link here')).toBe(X_POST_CREDIT_COST);
    expect(X_POST_CREDIT_COST).toBe(3);
  });

  it('prices a post with a link at the link cost', () => {
    expect(xPostCreditCost('New drop https://genfeed.ai')).toBe(
      X_POST_WITH_URL_CREDIT_COST,
    );
    expect(X_POST_WITH_URL_CREDIT_COST).toBe(30);
  });
});
