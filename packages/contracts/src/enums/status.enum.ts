/**
 * Which entity vocabulary a status value belongs to.
 *
 * `IngredientStatus`, `ArticleStatus`, and `PostStatus` are independent
 * vocabularies that share string values — `IngredientStatus.DRAFT` and
 * `ArticleStatus.DRAFT` are both `'DRAFT'`. Any lookup keyed on the bare status
 * string therefore silently resolves one domain's entry for another's value,
 * and a divergence in labels or variants becomes an invisible mislabel rather
 * than a type error. Every status-metadata lookup carries this discriminator so
 * the domains stay separate keyspaces.
 *
 * @see packages/ui/src/components/constants/status.constant.ts
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export enum StatusDomain {
  ARTICLE = 'article',
  INGREDIENT = 'ingredient',
  POST = 'post',
}

export enum Status {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  UPLOADED = 'uploaded',
  GENERATED = 'generated',
  UPSCALED = 'upscaled',
  CAPTIONED = 'captioned',
  VALIDATED = 'validated',
  MERGED = 'merged',
  RESIZED = 'resized',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
