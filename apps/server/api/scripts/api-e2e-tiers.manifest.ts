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
    'test/integration/payment-processing.integration.spec.ts',
    'test/integration/stripe-webhook-credit-grant.integration.spec.ts',
  ],
  exclusions: [
    {
      file: 'test/integration/health.e2e-spec.ts',
      reason:
        'Imports the removed @test/app.module harness and cannot collect under the current API E2E configuration.',
      trackingIssue: 71,
    },
    {
      file: 'test/integration/publish-flow.integration.spec.ts',
      reason:
        'Prisma 7 seed and DTO shape mismatches keep this spec non-hermetic; PR #1627 removed it from the release gate.',
      trackingIssue: 71,
    },
  ],
};
