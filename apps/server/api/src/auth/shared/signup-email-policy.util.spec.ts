import {
  canonicalizeEmail,
  hashCanonicalEmail,
  isDisposableEmail,
} from './signup-email-policy.util';

describe('signup-email-policy.util', () => {
  describe('canonicalizeEmail', () => {
    it('lowercases and drops +tags on any domain', () => {
      expect(canonicalizeEmail('  Jane+promo@Example.COM ')).toBe(
        'jane@example.com',
      );
    });

    it('folds Gmail dots and googlemail.com onto one mailbox', () => {
      expect(canonicalizeEmail('J.a.n.e+x@googlemail.com')).toBe(
        'jane@gmail.com',
      );
      expect(canonicalizeEmail('jane@gmail.com')).toBe('jane@gmail.com');
    });

    it('keeps dots on non-Gmail domains', () => {
      expect(canonicalizeEmail('j.ane@example.com')).toBe('j.ane@example.com');
    });

    it('returns null for values that are not an address', () => {
      expect(canonicalizeEmail('no-at-sign')).toBeNull();
      expect(canonicalizeEmail('@example.com')).toBeNull();
      expect(canonicalizeEmail('+tag@example.com')).toBeNull();
      expect(canonicalizeEmail('jane@')).toBeNull();
    });
  });

  describe('hashCanonicalEmail', () => {
    it('gives every alias of one mailbox the same key', () => {
      expect(hashCanonicalEmail('j.ane+a@gmail.com')).toBe(
        hashCanonicalEmail('jane@googlemail.com'),
      );
    });

    it('gives different mailboxes different keys', () => {
      expect(hashCanonicalEmail('a@example.com')).not.toBe(
        hashCanonicalEmail('b@example.com'),
      );
    });
  });

  describe('isDisposableEmail', () => {
    it('flags throwaway providers and their subdomains', () => {
      expect(isDisposableEmail('x@mailinator.com')).toBe(true);
      expect(isDisposableEmail('x@Yopmail.com')).toBe(true);
      expect(isDisposableEmail('x@inbox.mailinator.com')).toBe(true);
    });

    it('does not flag ordinary providers', () => {
      expect(isDisposableEmail('x@gmail.com')).toBe(false);
      expect(isDisposableEmail('x@genfeed.ai')).toBe(false);
      expect(isDisposableEmail('not-an-email')).toBe(false);
    });
  });
});
