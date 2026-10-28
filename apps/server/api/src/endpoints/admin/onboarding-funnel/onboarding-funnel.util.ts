import type {
  IOnboardingFunnelBucket,
  IOnboardingFunnelOrganization,
  OnboardingFunnelEmailClass,
  OnboardingFunnelStep,
} from '@genfeedai/contracts/interfaces';
import { extractEmailDomain, isPersonalEmailDomain } from '@genfeedai/helpers';

export const ONBOARDING_FUNNEL_STEPS: readonly OnboardingFunnelStep[] = [
  'websiteLink',
  'brandScanned',
  'draftsStarted',
  'draftsReady',
  'completed',
];

export const ONBOARDING_FUNNEL_EMAIL_CLASSES: readonly OnboardingFunnelEmailClass[] =
  ['personal', 'company', 'unknown'];

export function classifyOwnerEmail(
  email: string | null | undefined,
): OnboardingFunnelEmailClass {
  const domain = extractEmailDomain(email);
  if (!domain) return 'unknown';
  return isPersonalEmailDomain(domain) ? 'personal' : 'company';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The signup prefill marker saved on a brand's agent config, when it has one. */
export function readPrefillMarker(agentConfig: unknown): {
  hasScrapedWebsite: boolean;
  status: string | null;
} {
  const marker = isRecord(agentConfig) ? agentConfig.signupPrefill : undefined;
  if (!isRecord(marker)) return { hasScrapedWebsite: false, status: null };
  return {
    hasScrapedWebsite: marker.hasScrapedWebsite === true,
    status: typeof marker.status === 'string' ? marker.status : null,
  };
}

/** The first-drafts result status saved on an onboarding content run's config. */
export function readDraftsStatus(runConfig: unknown): string | null {
  const result = isRecord(runConfig) ? runConfig.result : undefined;
  return isRecord(result) && typeof result.status === 'string'
    ? result.status
    : null;
}

function emptyBucket(): IOnboardingFunnelBucket {
  return {
    steps: {
      brandScanned: 0,
      completed: 0,
      draftsReady: 0,
      draftsStarted: 0,
      websiteLink: 0,
    },
    total: 0,
  };
}

export function summarizeOnboardingFunnel(
  organizations: readonly IOnboardingFunnelOrganization[],
): {
  byEmailClass: Record<OnboardingFunnelEmailClass, IOnboardingFunnelBucket>;
  totals: IOnboardingFunnelBucket;
} {
  const totals = emptyBucket();
  const byEmailClass: Record<
    OnboardingFunnelEmailClass,
    IOnboardingFunnelBucket
  > = {
    company: emptyBucket(),
    personal: emptyBucket(),
    unknown: emptyBucket(),
  };

  for (const organization of organizations) {
    for (const bucket of [totals, byEmailClass[organization.emailClass]]) {
      bucket.total += 1;
      for (const step of ONBOARDING_FUNNEL_STEPS) {
        if (organization.steps[step]) bucket.steps[step] += 1;
      }
    }
  }

  return { byEmailClass, totals };
}
