import {
  PERSONAL_EMAIL_DOMAINS,
  PERSONAL_ORGANIZATION_LABEL,
} from '@genfeedai/contracts/constants';

const WWW_PREFIX_PATTERN = /^www\./i;
const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//i;
const TOP_LEVEL_DOMAIN_PATTERN = /\.[a-z]{2,}$/i;
const DOMAIN_SEPARATOR_RUN_PATTERN = /[.\-_]+/;
const LABEL_SEPARATOR_RUN_PATTERN = /[._\-\s]+/;
const NON_ALPHANUMERIC_CHARS_PATTERN = /[^a-z0-9]/g;

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
    return parsed.hostname.replace(WWW_PREFIX_PATTERN, '').toLowerCase();
  } catch {
    const fallback = normalizedValue
      .replace(HTTP_PROTOCOL_PREFIX_PATTERN, '')
      .split('/')[0]
      ?.replace(WWW_PREFIX_PATTERN, '')
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
    .replace(TOP_LEVEL_DOMAIN_PATTERN, '')
    .split(DOMAIN_SEPARATOR_RUN_PATTERN)
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
  /** The free-mail domains to treat as personal; defaults to the short built-in list. */
  personalEmailDomains?: readonly string[];
}

function titleCaseWorkspaceLabel(value: string): string {
  return value
    .split(LABEL_SEPARATOR_RUN_PATTERN)
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
  const fromDomain = resolveSignupBrandDomain({
    email: input.email,
    personalEmailDomains: input.personalEmailDomains,
  });
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

/**
 * Name the first organization. A personal mailbox (gmail and friends) carries
 * no company, so the org is simply "Personal" rather than a title-cased email
 * handle; every other signup is named like its workspace.
 */
export function resolveSignupOrganizationLabel(
  input: ResolveSignupWorkspaceLabelInput,
): string {
  if (
    isPersonalEmailDomain(
      extractEmailDomain(input.email),
      input.personalEmailDomains,
    )
  ) {
    return PERSONAL_ORGANIZATION_LABEL;
  }

  return resolveSignupWorkspaceLabel(input);
}

/**
 * Slug seed for a personal organization: `personal-` plus the tail of the
 * owner's opaque id. The email handle never reaches the URL, and the tail keeps
 * the first slug unique without a counting loop over every earlier "personal".
 */
export function buildPersonalOrganizationSlugSeed(userId: string): string {
  const tail = userId
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_CHARS_PATTERN, '')
    .slice(-8);

  return tail ? `personal-${tail}` : 'personal';
}
