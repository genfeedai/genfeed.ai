export type PostSignupIntent =
  | { kind: 'plan-checkout'; stripePriceId: string }
  | { kind: 'credits-checkout'; credits: number }
  | { kind: 'auto-brand'; domain: string }
  | { kind: 'manual-brand' };

interface ResolvePostSignupIntentInput {
  personalEmailDomains: readonly string[];
  primaryEmail?: string | null;
  selectedCredits?: string | null;
  selectedPlan?: string | null;
}

function extractDomain(email?: string | null): string | null {
  if (!email || !email.includes('@')) {
    return null;
  }

  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}

function parseCredits(rawCredits?: string | null): number | null {
  if (!rawCredits) {
    return null;
  }

  const parsed = Number.parseInt(rawCredits, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function deriveBrandNameFromDomain(domain: string): string {
  return domain
    .replace(/\.[a-z]{2,}$/i, '')
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .trim();
}

export function resolvePostSignupIntent(
  input: ResolvePostSignupIntentInput,
): PostSignupIntent {
  const selectedPlan = input.selectedPlan?.trim();
  if (selectedPlan) {
    return { kind: 'plan-checkout', stripePriceId: selectedPlan };
  }

  const credits = parseCredits(input.selectedCredits);
  if (credits) {
    return { credits, kind: 'credits-checkout' };
  }

  const domain = extractDomain(input.primaryEmail);
  if (!domain) {
    return { kind: 'manual-brand' };
  }

  const isPersonalEmail = input.personalEmailDomains.includes(domain);
  if (isPersonalEmail) {
    return { kind: 'manual-brand' };
  }

  return { domain, kind: 'auto-brand' };
}
