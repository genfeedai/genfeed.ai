/**
 * Content draft lifecycle.
 *
 * `content_drafts.status` is a `String` column (rule 2 of
 * `enum_source_of_truth`), not a Prisma enum — the orphan Postgres type of the
 * same name was dropped in `20260807160000_drop_orphan_enums`. Every write goes
 * through these SCREAMING members, the SQL default is `'DRAFT'`, and
 * `20260808120000_canonicalize_draft_target_status_casing` uppercased the
 * legacy rows `20260609150437_reconcile_prod_schema` had lowercased — the
 * column holds exactly one casing (#2543).
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
