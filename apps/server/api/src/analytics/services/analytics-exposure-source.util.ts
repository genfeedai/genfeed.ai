import type { ServerPostAnalytics } from '@api/server.dependencies';
import type {
  AnalyticsPersistenceContext,
  BreakoutCollectionContext,
  BreakoutPublicationSourceInput,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';

export async function prepareExposureCollectionSource(
  analytics: ServerPostAnalytics,
  input: BreakoutPublicationSourceInput,
): Promise<BreakoutPublicationSourceV1 | null> {
  return analytics.prepareExposureObservation
    ? analytics.prepareExposureObservation(input)
    : null;
}

export function exposureCollectionContext(
  source: BreakoutPublicationSourceV1 | null | undefined,
  collection: Omit<BreakoutCollectionContext, 'source'>,
): Pick<AnalyticsPersistenceContext, 'exposureObservation'> {
  return source ? { exposureObservation: { source, ...collection } } : {};
}
