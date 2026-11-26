import type { SchedulerPostTarget } from '@api/collections/post-groups/services/post-group.types';
import {
  type CredentialPlatform,
  ReleaseAttachmentKind,
} from '@genfeedai/contracts';
import { getChannelThreadChildCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import {
  type ReleaseAttachmentInput,
  releaseAttachmentInputSchema,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

/** One comment or thread post a channel target publishes behind its parent. */
export type AttachmentPostPlan = {
  body: string;
  kind: ReleaseAttachmentKind.COMMENT | ReleaseAttachmentKind.THREAD;
  order: number;
};

/**
 * The child posts carry their kind as the label suffix (`<title> comment`).
 * It is the only mark that tells them from the thread children an agent or
 * the composer wrote, so a release edit manages these rows and no others.
 */
export const ATTACHMENT_POST_LABEL_SUFFIXES = [
  ` ${ReleaseAttachmentKind.COMMENT}`,
  ` ${ReleaseAttachmentKind.THREAD}`,
] as const;

export function attachmentPostLabel(
  releaseTitle: string,
  kind: AttachmentPostPlan['kind'],
): string {
  return `${releaseTitle} ${kind}`;
}

/** Read the attachments stored as JSON on a release or a target. */
export function readStoredAttachments(
  value: unknown,
): ReleaseAttachmentInput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = releaseAttachmentInputSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Work out the comment and thread posts one target publishes.
 *
 * A release-level attachment applies to every target of its platform (or of
 * all platforms when it names none). A channel with no comment surface skips
 * the release-wide ones, which were never aimed at it, and refuses one that
 * was: storing a comment that can never publish would only show a comment
 * that is not queued.
 */
export function planAttachmentPosts(params: {
  platform: CredentialPlatform | string;
  releaseAttachments: readonly ReleaseAttachmentInput[];
  targetAttachments: readonly ReleaseAttachmentInput[];
}): AttachmentPostPlan[] {
  const isFollowUp = (attachment: ReleaseAttachmentInput): boolean =>
    attachment.kind === ReleaseAttachmentKind.COMMENT ||
    attachment.kind === ReleaseAttachmentKind.THREAD;

  const releaseScoped = params.releaseAttachments.filter(
    (attachment) =>
      isFollowUp(attachment) &&
      (!attachment.platform || attachment.platform === params.platform),
  );
  const targetScoped = params.targetAttachments.filter(isFollowUp);

  if (getChannelThreadChildCapability(params.platform).kind === 'unsupported') {
    const isAimedAtChannel =
      targetScoped.length > 0 ||
      releaseScoped.some((attachment) => attachment.platform);
    if (isAimedAtChannel) {
      throw new BadRequestException(
        `${params.platform} has no comment or thread surface, so a first comment cannot be scheduled for it.`,
      );
    }
    return [];
  }

  return [...releaseScoped, ...targetScoped].map((attachment, index) => ({
    body: attachment.body,
    kind: attachment.kind as AttachmentPostPlan['kind'],
    order: attachment.order ?? index,
  }));
}

/**
 * A child post copies its parent's lifecycle, schedule and visibility: it is
 * delivered only while it is SCHEDULED, after the parent went live.
 */
export function buildAttachmentPostData(params: {
  attachment: AttachmentPostPlan;
  brandId: string | null;
  groupId: string;
  organizationId: string;
  parent: SchedulerPostTarget;
  releaseTitle: string;
  userId: string;
}): Prisma.PostUncheckedCreateInput {
  const { attachment, parent } = params;
  return {
    brandId: params.brandId,
    credentialId: parent.credentialId,
    description: attachment.body,
    groupId: params.groupId,
    label: attachmentPostLabel(params.releaseTitle, attachment.kind),
    order: attachment.order,
    organizationId: params.organizationId,
    parentId: parent.id,
    platform: parent.platform,
    scheduledDate: parent.scheduledDate,
    targetExecutionState: parent.targetExecutionState,
    timezone: parent.timezone,
    userId: params.userId,
    visibility: parent.visibility,
  } as Prisma.PostUncheckedCreateInput;
}
