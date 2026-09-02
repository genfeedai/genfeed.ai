import { PERSONAL_EMAIL_DOMAINS } from '@genfeedai/contracts/constants';

export interface ResolveSignupBrandDomainInput {
  email?: string | null;
  requestedDomain?: string | null;
  personalEmailDomains?: readonly string[];
}

export interface ResolvedSignupBrandDomain {
  domain: string | null;
  brandName: string | null;
  websiteUrl: string | null;
  source: 'requested' | 'email' | 'none';
}

/**
 * Normalize any URL-ish or bare-hostname value down to a lowercase hostname
 * with the scheme, `www.` prefix, path, and port stripped.
 */
export function extractBrandDomain(value?: string | null): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    const parsed = new URL(
      normalizedValue.includes('://')
        ? normalizedValue
        : `https://${normalizedValue}`,
    );
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    const fallback = normalizedValue
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.replace(/^www\./i, '')
      .toLowerCase();

    return fallback || null;
  }
}

/**
 * Pull the domain part out of an email address. Returns null for anything that
 * is not a single well-formed `local@domain` pair.
 */
export function extractEmailDomain(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const parts = normalized.split('@');

  if (parts.length !== 2) {
    return null;
  }

  const domain = parts[1]?.trim();

  return domain?.includes('.') ? domain : null;
}

/**
 * Free-mail domains carry no brand signal — a gmail.com signup must never be
 * scraped as if it were the user's company website.
 */
export function isPersonalEmailDomain(
  domain?: string | null,
  personalEmailDomains: readonly string[] = PERSONAL_EMAIL_DOMAINS,
): boolean {
  const normalized = domain?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return personalEmailDomains.includes(normalized);
}

/**
 * Turn `acme-studio.co.uk` into `Acme Studio`. Only the final TLD label is
 * dropped, so multi-part suffixes keep their middle segment — good enough for a
 * seed label the user can rename.
 */
export function deriveBrandNameFromDomain(domain: string): string {
  return domain
    .replace(/\.[a-z]{2,}$/i, '')
    .split(/[.\-_]+/)
    .reduce<string[]>((segments, segment) => {
      if (segment) {
        segments.push(segment.charAt(0).toUpperCase() + segment.slice(1));
      }
      return segments;
    }, [])
    .join(' ')
    .trim();
}

/**
 * Decide which domain (if any) the signup prefill job should scrape.
 *
 * An explicitly requested domain always wins — the user typed it. Otherwise the
 * signup email is used, but only when it is a corporate address; personal
 * mailboxes resolve to `none` so the background job skips scraping entirely and
 * falls back to seeding defaults.
 */
export function resolveSignupBrandDomain(
  input: ResolveSignupBrandDomainInput,
): ResolvedSignupBrandDomain {
  const requested = extractBrandDomain(input.requestedDomain);

  if (requested) {
    return {
      brandName: deriveBrandNameFromDomain(requested) || null,
      domain: requested,
      source: 'requested',
      websiteUrl: `https://${requested}`,
    };
  }

  const emailDomain = extractEmailDomain(input.email);

  if (
    !emailDomain ||
    isPersonalEmailDomain(emailDomain, input.personalEmailDomains)
  ) {
    return { brandName: null, domain: null, source: 'none', websiteUrl: null };
  }

  return {
    brandName: deriveBrandNameFromDomain(emailDomain) || null,
    domain: emailDomain,
    source: 'email',
    websiteUrl: `https://${emailDomain}`,
  };
}

export interface ResolveSignupWorkspaceLabelInput {
  email?: string | null;
  name?: string | null;
}

function titleCaseWorkspaceLabel(value: string): string {
  return value
    .split(/[._\-\s]+/)
    .reduce<string[]>((segments, segment) => {
      if (segment) {
        segments.push(
          segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
        );
      }
      return segments;
    }, [])
    .join(' ')
    .trim();
}

/**
 * Name the first org/brand from the signed-in user. Corporate mail uses the
 * company domain; personal mail uses display name or the email local-part.
 * Never returns the leftover "Default Organization" stub.
 */
export function resolveSignupWorkspaceLabel(
  input: ResolveSignupWorkspaceLabelInput,
): string {
  const fromDomain = resolveSignupBrandDomain({ email: input.email });
  if (fromDomain.brandName) {
    return fromDomain.brandName;
  }

  const name = input.name?.trim();
  if (name) {
    return name;
  }

  const localPart = input.email?.split('@')[0]?.trim();
  if (localPart) {
    return titleCaseWorkspaceLabel(localPart) || 'Workspace';
  }

  return 'Workspace';
}
