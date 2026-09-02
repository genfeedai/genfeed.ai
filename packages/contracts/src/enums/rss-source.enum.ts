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

const RSS_APPROVAL_MODES = new Set<string>(Object.values(RssApprovalMode));
const RSS_IMPORT_POLICIES = new Set<string>(Object.values(RssImportPolicy));

export function parseRssApprovalMode(
  value: string | null | undefined,
): RssApprovalMode {
  if (!value || !RSS_APPROVAL_MODES.has(value)) {
    return RssApprovalMode.APPROVAL;
  }

  return value as RssApprovalMode;
}

export function parseRssImportPolicy(
  value: string | null | undefined,
): RssImportPolicy {
  if (!value || !RSS_IMPORT_POLICIES.has(value)) {
    return RssImportPolicy.DRAFT;
  }

  return value as RssImportPolicy;
}
