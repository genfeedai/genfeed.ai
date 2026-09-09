import { ReleaseAttachmentKind } from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseAttachment,
} from '@genfeedai/contracts/interfaces';
import type {
  TargetPreviewCredential,
  TargetPreviewProps,
  TargetPreviewRelease,
} from '@genfeedai/props/ui/previews.props';
import type { PlatformPreviewTarget } from '@ui/posts/platform-preview/PlatformPreview.types';

/**
 * A target's `settings.caption` is the per-platform text override; falling
 * back to the release's shared `baseContent` when no override is set.
 */
export function resolveTargetCaption(
  release: TargetPreviewRelease,
  target: IChannelTarget,
): string {
  const override = target.settings?.caption;
  return typeof override === 'string' && override.trim().length > 0
    ? override
    : release.baseContent;
}

function attachmentAppliesToTarget(
  attachment: IReleaseAttachment,
  target: IChannelTarget,
): boolean {
  if (attachment.targetId && attachment.targetId !== target.id) {
    return false;
  }

  return !attachment.platform || attachment.platform === target.platform;
}

function sortByOrder(attachments: IReleaseAttachment[]): IReleaseAttachment[] {
  return [...attachments].sort((a, b) => a.order - b.order);
}

/**
 * Attachments can live at either level: `release.attachments` carries
 * release-wide entries (e.g. a global signature shared by every target),
 * while `target.attachments` carries entries scoped to one channel target.
 * Both are candidates for a given target's rendered preview.
 */
function collectApplicableAttachments(
  release: TargetPreviewRelease,
  target: IChannelTarget,
  kind: ReleaseAttachmentKind,
): IReleaseAttachment[] {
  const candidates = [
    ...(release.attachments ?? []),
    ...(target.attachments ?? []),
  ];

  return sortByOrder(
    candidates.filter(
      (attachment) =>
        attachment.kind === kind &&
        attachmentAppliesToTarget(attachment, target),
    ),
  );
}

/**
 * Signature attachments append to the caption exactly once: every matching
 * `SIGNATURE` attachment (release-wide or target-scoped) is joined, in
 * order, into a single trailing block.
 */
export function resolveSignature(
  release: TargetPreviewRelease,
  target: IChannelTarget,
): string | undefined {
  const signatures = collectApplicableAttachments(
    release,
    target,
    ReleaseAttachmentKind.SIGNATURE,
  );

  if (signatures.length === 0) {
    return undefined;
  }

  return signatures.map((signature) => signature.body).join('\n');
}

/**
 * The first comment shown under a published post. Only the lowest-order
 * `COMMENT` attachment is placed there — later ones are follow-up replies,
 * not part of this preview's scope.
 */
export function resolveFirstComment(
  release: TargetPreviewRelease,
  target: IChannelTarget,
): string | undefined {
  const comments = collectApplicableAttachments(
    release,
    target,
    ReleaseAttachmentKind.COMMENT,
  );

  return comments[0]?.body;
}

export function getAuthorName(credential: TargetPreviewCredential): string {
  return (
    credential.externalName?.trim() ||
    credential.label?.trim() ||
    'Your Account'
  );
}

export function getAuthorHandle(credential: TargetPreviewCredential): string {
  const handle = credential.externalHandle?.trim();
  if (!handle) {
    return '@youraccount';
  }

  return handle.startsWith('@') ? handle : `@${handle}`;
}

export function buildTargetPreview({
  release,
  target,
  credential,
}: TargetPreviewProps): PlatformPreviewTarget {
  const caption = resolveTargetCaption(release, target);
  const signature = resolveSignature(release, target);
  return {
    author: {
      avatarUrl: credential.externalAvatar || undefined,
      handle: getAuthorHandle(credential),
      name: getAuthorName(credential),
    },
    caption: signature ? `${caption}\n\n${signature}` : caption,
    firstComment: resolveFirstComment(release, target),
    id: target.id,
    media: [...release.media]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((item) => ({
        id: item.assetId,
        isAnimated: item.kind === 'gif',
        kind:
          item.kind === 'video' || item.kind === 'short_video'
            ? item.kind
            : 'image',
        url: item.url || undefined,
      })),
    platform: target.platform,
    settings: target.settings,
    title: release.title,
  };
}
