import type {
  CredentialPlatform,
  ReleaseAttachmentKind,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';

/**
 * Supplemental content attached to a release or a specific channel target:
 * a first comment, a follow-up thread post, or an appended signature.
 *
 * When `platform` is set the attachment applies only to targets on that
 * platform; when `null` it applies to every target in the release (e.g. a
 * global signature).
 */
export interface IReleaseAttachment extends IBaseEntity {
  /** Release group this attachment belongs to. */
  releaseId: string;
  /** Specific channel target, when the attachment is scoped to one target. */
  targetId?: string | null;
  kind: ReleaseAttachmentKind;
  /** Platform scope, or `null` to apply across all targets. */
  platform?: CredentialPlatform | null;
  /** Attachment body (comment text, thread segment, or signature markup). */
  body: string;
  /** Ordering within a thread or a stack of comments/signatures. */
  order: number;
}
