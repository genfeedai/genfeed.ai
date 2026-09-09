import { parseActivityKey } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import {
  getBackgroundTaskStatus,
  isBackgroundTask,
  parseActivityValue,
} from '@pages/activities/activities-list.utils';

export function isActiveGenerationActivity(activity: IActivity): boolean {
  if (!isBackgroundTask(activity)) return false;
  const status = getBackgroundTaskStatus(activity.key);
  return status === 'pending' || status === 'processing';
}

export function getGenerationActivityStatus(activity: IActivity) {
  const value = parseActivityValue(activity.value);
  if (value?.error === 'Cancelled by user') return 'cancelled' as const;
  const status = getBackgroundTaskStatus(activity.key);
  if (status === 'pending') return 'queued' as const;
  if (status === 'processing') return 'generating' as const;
  if (status === 'failed') return 'failed' as const;
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
  const value = parseActivityValue(activity.value);
  const subject = parseActivityKey(activity.key).subject;
  const entityModel = activity.entityModel?.toLowerCase();
  const id =
    activity.entityId ||
    (typeof value?.resultId === 'string' ? value.resultId : undefined) ||
    (typeof value?.ingredientId === 'string'
      ? value.ingredientId
      : undefined) ||
    (['article', 'post'].includes(subject) &&
    /^[a-zA-Z0-9_-]+$/.test(activity.value)
      ? activity.value
      : undefined);
  let path: string = APP_ROUTES.WORKSPACE.ACTIVITY;
  if (
    id &&
    (entityModel === 'ingredient' ||
      ['image', 'video', 'music', 'voice', 'avatar', 'audio'].includes(subject))
  ) {
    path = createLibraryAssetRoute(
      activity.source === 'avatar-generate' ? 'AVATAR' : subject,
      id,
    );
  } else if (id && (entityModel === 'article' || subject === 'article')) {
    path = createArtifactEditorRoute('article', encodeURIComponent(id));
  } else if (id && (entityModel === 'post' || subject === 'post')) {
    path = createArtifactEditorRoute('post', encodeURIComponent(id));
  } else if (id && entityModel === 'workflow') {
    path = `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${encodeURIComponent(id)}`;
  }
  return brand
    ? createBrandAppRoute(scope.orgSlug, brand.slug, path)
    : createOrganizationAppRoute(scope.orgSlug, APP_ROUTES.WORKSPACE.ACTIVITY);
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
