import { DISPOSABLE_EMAIL_DOMAINS } from '@api/auth/shared/disposable-email-domains.constant';
import { OrganizationCategory } from '@genfeedai/contracts';
import type { OrganizationOwnerEmailClass } from '@genfeedai/contracts/interfaces';
import { extractEmailDomain } from '@genfeedai/helpers';
import freeEmailDomains from 'free-email-domains';

/**
 * Every domain whose mailbox says nothing about an employer: the maintained
 * `free-email-domains` list (gmail, yahoo, proton, regional providers...) plus
 * the throwaway providers signup already refuses a trial grant to. Lowercase,
 * deduplicated, and safe to hand to SQL as a `text[]`.
 */
export const PERSONAL_EMAIL_DOMAIN_LIST: readonly string[] = [
  ...new Set([...freeEmailDomains, ...DISPOSABLE_EMAIL_DOMAINS]),
].map((domain) => domain.toLowerCase());

const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set(
  PERSONAL_EMAIL_DOMAIN_LIST,
);

/**
 * `company` for a work address, `personal` for a free or throwaway provider,
 * `unknown` when there is no usable address (a phone or social-only signup).
 */
export function classifyEmail(
  email: string | null | undefined,
): OrganizationOwnerEmailClass {
  const domain = extractEmailDomain(email);
  if (!domain) {
    return 'unknown';
  }
  return PERSONAL_EMAIL_DOMAINS.has(domain) ? 'personal' : 'company';
}

/**
 * Category a new organization starts with when the signup did not pick one:
 * a free or throwaway mailbox is a creator, a work domain is a business. An
 * address-less signup (phone or social only) keeps the historical BUSINESS
 * default.
 */
export function resolveDefaultOrganizationCategory(
  email: string | null | undefined,
): OrganizationCategory {
  return classifyEmail(email) === 'personal'
    ? OrganizationCategory.CREATOR
    : OrganizationCategory.BUSINESS;
}
