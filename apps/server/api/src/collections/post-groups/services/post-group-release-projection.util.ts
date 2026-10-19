import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import { stripHtmlToPlainText } from '@genfeedai/helpers';

const RELEASE_TITLE_MAX_LENGTH = 80;
const UNTITLED_RELEASE = 'Untitled post';

function toPlainTitleText(value?: string | null): string {
  return stripHtmlToPlainText(value).replace(/\s+/g, ' ').trim();
}

/**
 * A release title is operator-facing plain text: the post label, else the
 * start of its content. Post content is stored as editor HTML, so it is
 * flattened first — never persist or project raw markup as a title.
 */
export function deriveReleaseTitle(
  label: string | null | undefined,
  content: string | null | undefined,
): string {
  const labelTitle = toPlainTitleText(label);
  if (labelTitle) {
    return labelTitle;
  }
  const contentTitle = toPlainTitleText(content);
  if (!contentTitle) {
    return UNTITLED_RELEASE;
  }
  return contentTitle.length > RELEASE_TITLE_MAX_LENGTH
    ? `${contentTitle.slice(0, RELEASE_TITLE_MAX_LENGTH - 3).trimEnd()}...`
    : contentTitle;
}

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
    title: deriveReleaseTitle(target.label, target.description),
    updatedAt: target.updatedAt,
  };
}
