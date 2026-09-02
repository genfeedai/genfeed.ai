import { TargetExecutionState } from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import type {
  ReleaseGroupListQuery,
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@server/collections/post-groups/services/post-group.types';

export function toSyntheticReleaseGroup(
  target: SchedulerPostTarget,
  organizationId: string,
): SchedulerPostGroup | null {
  if (
    target.organizationId !== organizationId ||
    !target.userId ||
    target.description === undefined
  ) {
    return null;
  }

  const contentTitle = target.description.replace(/<[^>]+>/g, ' ').trim();
  const title =
    target.label?.trim() ||
    (contentTitle.length > 80
      ? `${contentTitle.slice(0, 77).trimEnd()}...`
      : contentTitle) ||
    'Untitled post';

  return {
    attachments: [],
    baseContent: target.description,
    brandId: target.brandId,
    createdAt: target.createdAt,
    id: target.id,
    campaignId: target.campaignId,
    idempotencyKey: null,
    isDeleted: target.isDeleted,
    media: [],
    organizationId,
    ownerId: target.userId,
    postingSetId: null,
    publishedAt: target.publishedAt,
    recurrence: null,
    rssFeedItemId: null,
    rssSourceId: null,
    scheduledAt: target.scheduledDate,
    status: target.targetExecutionState,
    statusTransitions: [],
    timezone: target.timezone,
    title,
    updatedAt: target.updatedAt,
  };
}

export function matchesReleaseListQuery(
  release: IReleaseGroup,
  query: ReleaseGroupListQuery,
): boolean {
  if (query.startDate && query.endDate) {
    const start = query.startDate.getTime();
    const end = query.endDate.getTime();
    const occupiesWindow = [
      release.scheduledAt,
      ...(release.targets ?? []).map((target) => target.scheduledAt),
    ].some((scheduledAt) => {
      if (!scheduledAt) {
        return false;
      }
      const instant = Date.parse(scheduledAt);
      return Number.isFinite(instant) && instant >= start && instant <= end;
    });
    if (!occupiesWindow) {
      return false;
    }
  }

  if (query.statuses?.length && !query.statuses.includes(release.status)) {
    return false;
  }

  if (query.campaignId && release.campaignId !== query.campaignId) {
    return false;
  }

  const targets = release.targets ?? [];
  const hasTargetFilters = Boolean(
    query.categories?.length ||
      query.credentialIds?.length ||
      query.executionStates?.length ||
      query.platforms?.length ||
      query.sources?.length,
  );
  if (
    hasTargetFilters &&
    !targets.some(
      (target) =>
        (!query.categories?.length ||
          (target.category !== undefined &&
            query.categories.includes(target.category))) &&
        (!query.credentialIds?.length ||
          query.credentialIds.includes(target.credentialId)) &&
        (!query.executionStates?.length ||
          query.executionStates.includes(target.executionState)) &&
        (!query.platforms?.length ||
          query.platforms.includes(target.platform)) &&
        (!query.sources?.length || query.sources.includes(target.source)),
    )
  ) {
    return false;
  }

  if (query.publicationState) {
    const isPosted = targets.some(
      (target) => target.executionState === TargetExecutionState.PUBLISHED,
    );
    if (
      (query.publicationState === 'posted' && !isPosted) ||
      (query.publicationState === 'not-posted' && isPosted)
    ) {
      return false;
    }
  }

  const search = query.search?.trim().toLocaleLowerCase();
  if (search) {
    const searchableValues = [
      release.title,
      release.baseContent,
      ...targets.flatMap((target) => [target.platform, target.category ?? '']),
    ];
    if (
      !searchableValues.some((value) =>
        String(value).toLocaleLowerCase().includes(search),
      )
    ) {
      return false;
    }
  }

  return true;
}

function getEarliestSchedule(release: IReleaseGroup): number {
  const schedules = [
    release.scheduledAt,
    ...(release.targets ?? []).map((target) => target.scheduledAt),
  ]
    .filter((scheduledAt): scheduledAt is string => Boolean(scheduledAt))
    .map((scheduledAt) => Date.parse(scheduledAt))
    .filter(Number.isFinite);

  return schedules.length > 0 ? Math.min(...schedules) : Number.MAX_VALUE;
}

function releaseSortValue(
  release: IReleaseGroup,
  field: string | undefined,
): number | null {
  const value =
    field === 'scheduledDate'
      ? getEarliestSchedule(release)
      : field === 'updatedAt'
        ? Date.parse(release.updatedAt)
        : Date.parse(release.createdAt);
  return Number.isFinite(value) && value !== Number.MAX_VALUE ? value : null;
}

export function compareReleaseProjections(
  left: IReleaseGroup,
  right: IReleaseGroup,
  query: ReleaseGroupListQuery,
): number {
  const sort =
    query.sort ??
    (query.startDate && query.endDate ? 'scheduledDate: 1' : 'createdAt: -1');
  const [field, directionText] = sort.split(': ');
  const direction = directionText === '1' ? 1 : -1;
  const leftValue = releaseSortValue(left, field);
  const rightValue = releaseSortValue(right, field);

  if (leftValue === null && rightValue !== null) {
    return 1;
  }
  if (leftValue !== null && rightValue === null) {
    return -1;
  }
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return (leftValue - rightValue) * direction;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
