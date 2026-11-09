import {
  createNewsletterToken,
  readNewsletterToken,
  subscriberEmailHash,
} from '@api/collections/newsletter-sends/utils/newsletter-token.util';
import { describe, expect, it } from 'vitest';

const SECRET = 'test-signing-key-test-signing-key';

describe('newsletter tokens', () => {
  it('reads back the subject it signed', () => {
    const token = createNewsletterToken(SECRET, 'unsubscribe', 'cm1subscriber');

    expect(readNewsletterToken(SECRET, 'unsubscribe', token)).toBe(
      'cm1subscriber',
    );
  });

  it.each([
    ['another purpose', 'click', 'unsubscribe'],
    ['another key', 'unsubscribe', 'unsubscribe'],
  ] as const)(
    'rejects a token read with %s',
    (_case, signPurpose, readPurpose) => {
      const token = createNewsletterToken(SECRET, signPurpose, 'cm1subscriber');
      const key = _case === 'another key' ? `${SECRET}x` : SECRET;

      expect(readNewsletterToken(key, readPurpose, token)).toBeNull();
    },
  );

  it('rejects a token whose subject was swapped', () => {
    const token = createNewsletterToken(SECRET, 'unsubscribe', 'cm1subscriber');
    const forged = `cm1other${token.slice(token.indexOf('.'))}`;

    expect(readNewsletterToken(SECRET, 'unsubscribe', forged)).toBeNull();
  });

  it('hashes an address case-insensitively', () => {
    expect(subscriberEmailHash(' Reader@Example.COM ')).toBe(
      subscriberEmailHash('reader@example.com'),
    );
  });
});
