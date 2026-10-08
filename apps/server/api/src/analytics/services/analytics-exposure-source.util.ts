import type { ServerPostAnalytics } from '@api/server.dependencies';
import type {
  AnalyticsPersistenceContext,
  BreakoutCollectionContext,
  BreakoutPublicationSourceInput,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';

export function assertExposureCollectionScope(
  context: AnalyticsPersistenceContext,
  postId: string,
  platform: BreakoutPublicationSourceInput['platform'] | undefined,
): void {
  const source = context.exposureObservation?.source;
  if (
    source &&
    (source.organizationId !== context.organizationId ||
      source.brandId !== context.brandId ||
      source.credentialId !== context.credentialId ||
      source.postId !== postId ||
      source.platform !== platform)
  )
    throw new Error('Exposure collection source does not match its account');
}

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
