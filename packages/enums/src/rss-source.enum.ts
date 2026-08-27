/**
 * RSS autoposting vocabularies. Prisma-backed; labels are SCREAMING.
 * Foundation for #1131.
 */

export enum RssImportPolicy {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISH_NOW = 'PUBLISH_NOW',
}

export enum RssApprovalMode {
  APPROVAL = 'APPROVAL',
  AUTO = 'AUTO',
}

export enum RssFeedItemStatus {
  PENDING = 'PENDING',
  IMPORTED = 'IMPORTED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}
