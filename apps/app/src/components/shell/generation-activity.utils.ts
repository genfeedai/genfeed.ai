import { ActivityKey } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import {
  getActivityDestinationPath,
  getBackgroundTaskStatus,
  isBackgroundTask,
  parseActivityValue,
} from '@pages/activities/activities-list.utils';

/**
 * A row is in flight only when its key is one the server's `activeOnly` filter
 * would return (`activities.controller.ts`). The shared lifecycle mapping folds
 * `created` and `scheduled` into `processing` for badge copy, so reusing it here
 * counted every created or scheduled post as a running generation and the bell
 * badge never cleared.
 */
export function isInFlightGenerationKey(key: string): boolean {
  return (
    key.endsWith('-processing') || key === ActivityKey.MODELS_TRAINING_CREATED
  );
}

export function isActiveGenerationActivity(activity: IActivity): boolean {
  return isBackgroundTask(activity) && isInFlightGenerationKey(activity.key);
}

export function getGenerationActivityStatus(activity: IActivity) {
  const value = parseActivityValue(activity.value);
  if (value?.error === 'Cancelled by user') return 'cancelled' as const;
  if (isInFlightGenerationKey(activity.key)) return 'generating' as const;
  const status = getBackgroundTaskStatus(activity.key);
  if (status === 'failed') return 'failed' as const;
  if (status === 'pending') return 'queued' as const;
  return 'ready' as const;
}

export function getGenerationActivityHref(
  activity: IActivity,
  scope: {
    organizationId: string;
    orgSlug: string;
    brands: ReadonlyArray<{ id: string; slug: string }>;
  },
): string | null {
  if (!scope.orgSlug || activity.organizationId !== scope.organizationId)
    return null;
  const brand = scope.brands.find((item) => item.id === activity.brandId);
  // Never substitute the currently selected brand for the activity's owner.
  if (activity.brandId && !brand)
    return createOrganizationAppRoute(
      scope.orgSlug,
      APP_ROUTES.WORKSPACE.ACTIVITY,
    );
  const path =
    getActivityDestinationPath(activity) ?? APP_ROUTES.WORKSPACE.ACTIVITY;
  return brand
    ? createBrandAppRoute(scope.orgSlug, brand.slug, path)
    : createOrganizationAppRoute(scope.orgSlug, path);
}

export function mergeGenerationActivities(
  recent: IActivity[],
  active: IActivity[],
  organizationId: string,
): IActivity[] {
  const merged = new Map<string, IActivity>();
  for (const item of [...active, ...recent]) {
    if (item.organizationId !== organizationId) continue;
    const previous = merged.get(item.id);
    if (previous && Date.parse(previous.updatedAt) > Date.parse(item.updatedAt))
      continue;
    merged.set(item.id, item);
  }
  return [...merged.values()];
}
