import type { AnalyticsCollectionAuthorization } from '@api/analytics/analytics-collection-action.types';

/** Provider/persistence unit fixtures only; native execution-proof fixtures own actual caller admission. */
export const analyticsCollectionAuthorizationFixture: AnalyticsCollectionAuthorization =
  {
    initiatingActor: {
      userId: 'user-1',
      organizationId: 'org-1',
      isApiKey: false,
      scopes: [],
    },
    admit: async () => undefined,
  };
