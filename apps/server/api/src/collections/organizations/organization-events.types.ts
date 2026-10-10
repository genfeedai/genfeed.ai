export type OrganizationCreatedEvent = {
  brandId: string;
  organizationId: string;
  userId: string;
  /** The website the creator typed, if any; the brand scan reads it. */
  websiteUrl?: string;
};

export type OrganizationOnboardingFinishedEvent = {
  organizationId: string;
  /** Which path ended onboarding. */
  outcome: 'completed' | 'skipped';
  userId: string;
};
