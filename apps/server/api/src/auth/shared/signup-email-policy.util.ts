import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-email-domains.constant';
import { hashToken } from './pkce.util';

const GMAIL_DOMAINS: readonly string[] = ['gmail.com', 'googlemail.com'];

function splitEmail(email: string): { domain: string; local: string } | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) {
    return null;
  }
  return {
    domain: normalized.slice(separator + 1),
    local: normalized.slice(0, separator),
  };
}

/**
 * The mailbox an address really delivers to, so one inbox cannot masquerade as
 * many signups: `+tag` suffixes are dropped everywhere, and Gmail ignores dots
 * and treats `googlemail.com` as `gmail.com`. Returns `null` for a value that
 * is not an email address.
 */
export function canonicalizeEmail(email: string): string | null {
  const parts = splitEmail(email);
  if (!parts) {
    return null;
  }
  const isGmail = GMAIL_DOMAINS.includes(parts.domain);
  const local = parts.local.split('+')[0] ?? '';
  const canonicalLocal = isGmail ? local.replaceAll('.', '') : local;
  if (!canonicalLocal) {
    return null;
  }
  return `${canonicalLocal}@${isGmail ? 'gmail.com' : parts.domain}`;
}

/** Stable, non-reversible key for a canonical mailbox, safe to store in a ledger. */
export function hashCanonicalEmail(email: string): string | null {
  const canonical = canonicalizeEmail(email);
  return canonical ? hashToken(canonical) : null;
}

/** True when the address, or a parent of its domain, is a throwaway provider. */
export function isDisposableEmail(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) {
    return false;
  }
  const labels = parts.domain.split('.');
  for (let index = 0; index < labels.length - 1; index += 1) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(index).join('.'))) {
      return true;
    }
  }
  return false;
}
