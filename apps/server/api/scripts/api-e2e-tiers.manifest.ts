export type ApiE2eExclusion = {
  file: string;
  reason: string;
  trackingIssue: number;
};

export type ApiE2eTierManifest = {
  coreFiles: string[];
  exclusions: ApiE2eExclusion[];
};

export const API_E2E_TIER_MANIFEST: ApiE2eTierManifest = {
  coreFiles: [
    'test/e2e/integrations.e2e-spec.ts',
    'test/integration/generation-credit-decrement.integration.spec.ts',
    'test/integration/health.e2e-spec.spec.ts',
    'test/integration/launch-path-contracts.integration.spec.ts',
    'test/integration/member-invitation-lifecycle.integration.spec.ts',
    'test/integration/payment-processing.integration.spec.ts',
    'test/integration/stripe-webhook-credit-grant.integration.spec.ts',
  ],
  exclusions: [
    {
      file: 'test/e2e/brands.e2e-spec.ts',
      reason:
        'The Prisma-era controller graph now requires CreditsGuard collaborators and the legacy fixture contract has not been migrated.',
      trackingIssue: 71,
    },
    {
      file: 'test/e2e/organizations.e2e-spec.ts',
      reason:
        'Uses a legacy Supertest request builder and Mongo-era tag/post fixture fields that Prisma rejects.',
      trackingIssue: 71,
    },
    {
      file: 'test/integration/api-response-benchmarks.runner.spec.ts',
      reason:
        'The benchmark seed still passes a Mongo identifier to randomUUID and requires a Prisma-native deterministic seed.',
      trackingIssue: 71,
    },
    {
      file: 'test/integration/social-media-publishing.integration.spec.ts',
      reason:
        'The mocked scheduling and rollback assertions no longer match the current publishing service contract.',
      trackingIssue: 71,
    },
    {
      file: 'test/integration/trainings.schema.integration.spec.ts',
      reason:
        'Still seeds fields from the removed Mongo training schema that are invalid for the current Prisma model.',
      trackingIssue: 71,
    },
    {
      file: 'test/integration/video-generation.integration.spec.ts',
      reason:
        'The legacy FFmpeg/AWS mock expectations no longer match the current video generation workflow.',
      trackingIssue: 71,
    },
  ],
};
