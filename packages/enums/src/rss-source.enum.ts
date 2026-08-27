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

export function parseRssApprovalMode(
  value: string | null | undefined,
): RssApprovalMode {
  switch (value) {
    case RssApprovalMode.APPROVAL:
      return RssApprovalMode.APPROVAL;
    case RssApprovalMode.AUTO:
      return RssApprovalMode.AUTO;
    default:
      return RssApprovalMode.APPROVAL;
  }
}

export function parseRssImportPolicy(
  value: string | null | undefined,
): RssImportPolicy {
  switch (value) {
    case RssImportPolicy.DRAFT:
      return RssImportPolicy.DRAFT;
    case RssImportPolicy.SCHEDULED:
      return RssImportPolicy.SCHEDULED;
    case RssImportPolicy.PUBLISH_NOW:
      return RssImportPolicy.PUBLISH_NOW;
    default:
      return RssImportPolicy.DRAFT;
  }
}
