import { ReleaseAttachmentKind } from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseAttachment,
} from '@genfeedai/contracts/interfaces';
import type {
  TargetPreviewCredential,
  TargetPreviewRelease,
} from '@genfeedai/props/ui/previews.props';

export interface CaptionPreviewState {
  text: string;
  count: number;
  maxLength?: number;
  isTruncated: boolean;
}

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

/** Unicode-safe character count so multi-byte captions aren't undercounted. */
export function countPreviewCharacters(text: string): number {
  return Array.from(text).length;
}

export function getCaptionPreviewState(
  caption: string,
  maxLength?: number,
): CaptionPreviewState {
  const characters = Array.from(caption);
  const count = characters.length;

  if (!maxLength || count <= maxLength) {
    return { count, isTruncated: false, maxLength, text: caption };
  }

  return {
    count,
    isTruncated: true,
    maxLength,
    text: `${characters.slice(0, maxLength).join('')}...`,
  };
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
