/** The onboarding steps an organization can complete, in the order the flow offers them. */
export type OnboardingFunnelStep =
  | 'websiteLink'
  | 'brandScanned'
  | 'draftsStarted'
  | 'draftsReady'
  | 'completed';

export type OnboardingFunnelEmailClass = 'company' | 'personal' | 'unknown';

/**
 * One organization's onboarding progress. Carries the owner's email class,
 * never the address itself. A step is true when that step happened, whatever
 * came before it: the link step can be skipped. `websiteLink` means a website
 * is saved on one of the brands (from the signup email or a successful scan);
 * a rejected or unreachable link is not saved, so attempts show in the API
 * logs ("Onboarding brand scan"), not here.
 */
export interface IOnboardingFunnelOrganization {
  createdAt: string;
  draftsStatus: string | null;
  emailClass: OnboardingFunnelEmailClass;
  id: string;
  scanStatus: string | null;
  steps: Record<OnboardingFunnelStep, boolean>;
}

export interface IOnboardingFunnelBucket {
  /** Organizations in the bucket that completed each step. */
  steps: Record<OnboardingFunnelStep, number>;
  total: number;
}

/** Platform-admin read of how new organizations move through onboarding. */
export interface IOnboardingFunnelReport {
  byEmailClass: Record<OnboardingFunnelEmailClass, IOnboardingFunnelBucket>;
  generatedAt: string;
  organizations: IOnboardingFunnelOrganization[];
  since: string;
  totals: IOnboardingFunnelBucket;
  windowDays: number;
}
