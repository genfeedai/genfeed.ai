/**
 * Content draft lifecycle.
 *
 * `content_drafts.status` is a `String` column (rule 2 of
 * `enum_source_of_truth`), not a Prisma enum — the orphan Postgres type of the
 * same name was dropped in `20260807160000_drop_orphan_enums`. Every write goes
 * through these SCREAMING members. The column's SQL default is still the
 * lowercase `'draft'` that `20260609150437_reconcile_prod_schema` left behind,
 * along with rows that migration lowercased, so the casing is not yet uniform
 * in existing data.
 *
 * @see packages/prisma/prisma/schema.prisma `model ContentDraft`
 */
export enum ContentDraftStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
}
