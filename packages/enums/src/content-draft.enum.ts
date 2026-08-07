/**
 * Content draft lifecycle.
 *
 * Prisma declares `ContentDraftStatus` but no model column uses it yet
 * (orphan type). Values still match the Prisma labels so a future column
 * write needs no cast.
 *
 * @see packages/prisma/prisma/schema.prisma `enum ContentDraftStatus`
 */
export enum ContentDraftStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
}
