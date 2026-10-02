import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import type { Prisma } from '@genfeedai/prisma';

export type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
export type LearningPublicationAssociationV1 = Omit<
  LearningPublicationSourceV1,
  'finalizationId' | 'finalizationVersion' | 'approvalVersion'
>;
export type LearningPublicationPostVersionInputV1 = Pick<
  LearningPublicationAssociationV1,
  | 'organizationId'
  | 'brandId'
  | 'credentialId'
  | 'postId'
  | 'platform'
  | 'externalId'
  | 'publishedAt'
> & { description: string };
export const learningPublicationPostSelect = {
  brandId: true,
  category: true,
  credentialId: true,
  description: true,
  entityArticleId: true,
  entityIngredientId: true,
  entityModel: true,
  groupId: true,
  id: true,
  isRepeat: true,
  isShareToFeedSelected: true,
  label: true,
  maxRepeats: true,
  nextScheduledDate: true,
  order: true,
  originalPostId: true,
  parentId: true,
  platform: true,
  publishIntent: true,
  quoteTweetId: true,
  repeatDaysOfWeek: true,
  repeatEndDate: true,
  repeatFrequency: true,
  repeatInterval: true,
  scheduleSlot: true,
  scheduledDate: true,
  targetAttachments: true,
  targetSettings: true,
  timezone: true,
  variantId: true,
  organizationId: true,
  isDeleted: true,
  format: true,
  visibility: true,
  targetExecutionState: true,
  externalId: true,
  publishedAt: true,
  publishApprovalId: true,
  reviewVersionPinId: true,
  _count: {
    select: {
      ingredients: true,
      children: { where: { isDeleted: false } },
    },
  },
} satisfies Prisma.PostSelect;
export const learningPublicationOrganizationSelect = {
  id: true,
  isDeleted: true,
} satisfies Prisma.OrganizationSelect;
export const learningPublicationBrandSelect = {
  id: true,
  organizationId: true,
  isDeleted: true,
  isActive: true,
} satisfies Prisma.BrandSelect;
export const learningPublicationCredentialSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  isDeleted: true,
  isConnected: true,
  platform: true,
} satisfies Prisma.CredentialSelect;
export const learningPublicationApprovalSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  postId: true,
  artifactVersionPinId: true,
  operationId: true,
  status: true,
  invalidatedAt: true,
  scopeDigest: true,
} satisfies Prisma.PublishApprovalSelect;
export const learningPublicationPinSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  recordKind: true,
  recordId: true,
  contentDigest: true,
} satisfies Prisma.ContentVersionPinSelect;
export const learningPublicationFinalizationSelect = {
  id: true,
  organizationId: true,
  postId: true,
  result: true,
} satisfies Prisma.PostPublishFinalizationSelect;
export type LearningPublicationPostRow = Prisma.PostGetPayload<{
  select: typeof learningPublicationPostSelect;
}>;
export type LearningPublicationOrganizationRow = Prisma.OrganizationGetPayload<{
  select: typeof learningPublicationOrganizationSelect;
}>;
export type LearningPublicationBrandRow = Prisma.BrandGetPayload<{
  select: typeof learningPublicationBrandSelect;
}>;
export type LearningPublicationCredentialRow = Prisma.CredentialGetPayload<{
  select: typeof learningPublicationCredentialSelect;
}>;
export type LearningPublicationApprovalRow = Prisma.PublishApprovalGetPayload<{
  select: typeof learningPublicationApprovalSelect;
}>;
export type LearningPublicationPinRow = Prisma.ContentVersionPinGetPayload<{
  select: typeof learningPublicationPinSelect;
}>;
export type LearningPublicationFinalizationRow =
  Prisma.PostPublishFinalizationGetPayload<{
    select: typeof learningPublicationFinalizationSelect;
  }>;
