import {
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/enums';
import { z } from 'zod';
import {
  dateStringSchema,
  nonEmptyStringSchema,
} from '../helpers/common-schemas';

const idSchema = nonEmptyStringSchema({ max: 255 });

export const publishApprovalDestinationSchema = z.object({
  credentialId: idSchema,
  platform: z.nativeEnum(CredentialPlatform),
});

export const publishScheduleIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('immediate') }),
  z.object({
    kind: z.literal('scheduled'),
    scheduledAt: dateStringSchema,
    timezone: z.string().min(1).max(255),
  }),
]);

export const publishApprovalPolicySchema = z.object({
  id: z.literal(PublishApprovalPolicyId.VERSION_BOUND_V1),
  version: z.literal(1),
});

export const createPublishApprovalSchema = z.object({
  contextVersion: z.number().int().nonnegative().optional(),
  policy: publishApprovalPolicySchema,
  postId: idSchema,
  scheduleIntent: publishScheduleIntentSchema,
});

export const publishApprovalStatusSchema = z.nativeEnum(PublishApprovalStatus);

export const publishApprovalStatusTransitions = {
  [PublishApprovalStatus.APPROVED]: [
    PublishApprovalStatus.QUEUED,
    PublishApprovalStatus.CANCELLED,
    PublishApprovalStatus.INVALIDATED,
  ],
  [PublishApprovalStatus.QUEUED]: [
    PublishApprovalStatus.EXECUTING,
    PublishApprovalStatus.CANCELLED,
    PublishApprovalStatus.INVALIDATED,
  ],
  [PublishApprovalStatus.EXECUTING]: [
    PublishApprovalStatus.PUBLISHED,
    PublishApprovalStatus.FAILED,
  ],
  [PublishApprovalStatus.FAILED]: [
    PublishApprovalStatus.QUEUED,
    PublishApprovalStatus.CANCELLED,
    PublishApprovalStatus.INVALIDATED,
  ],
  [PublishApprovalStatus.PUBLISHED]: [],
  [PublishApprovalStatus.CANCELLED]: [],
  [PublishApprovalStatus.INVALIDATED]: [],
} as const satisfies Readonly<
  Record<PublishApprovalStatus, readonly PublishApprovalStatus[]>
>;

export function canTransitionPublishApprovalStatus(
  from: PublishApprovalStatus,
  to: PublishApprovalStatus,
): boolean {
  return (
    publishApprovalStatusTransitions[from] as readonly PublishApprovalStatus[]
  ).includes(to);
}

export type PublishApprovalDestinationInput = z.infer<
  typeof publishApprovalDestinationSchema
>;
export type PublishScheduleIntentInput = z.infer<
  typeof publishScheduleIntentSchema
>;
export type PublishApprovalPolicyInput = z.infer<
  typeof publishApprovalPolicySchema
>;
export type CreatePublishApprovalInput = z.infer<
  typeof createPublishApprovalSchema
>;
