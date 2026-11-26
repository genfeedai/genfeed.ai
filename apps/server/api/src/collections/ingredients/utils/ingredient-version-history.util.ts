import {
  IngredientRelationKind,
  IngredientVersionRelation,
} from '@genfeedai/contracts';

/** Prisma returns the enum as its label, so rows carry the label type. */
export type RelationKindLabel = `${IngredientRelationKind}`;

/** The links whose children belong to the parent's history. */
export const VERSION_RELATION_KINDS = [
  'VERSION',
  'TRANSFORMATION',
] as const satisfies readonly RelationKindLabel[];

export interface VersionHistoryRow {
  activeVersionId: string | null;
  createdAt: Date;
  id: string;
  parentId: string | null;
  relationKind: RelationKindLabel | null;
  version: number;
}

/** True when a child with this relation belongs to its parent's history. */
export function isVersionRelation(
  kind: RelationKindLabel | null | undefined,
): boolean {
  return kind === 'VERSION' || kind === 'TRANSFORMATION';
}

/**
 * What created an entry of a version history.
 *
 * Only a recorded relation is trusted. An asset linked to a parent before
 * relations were recorded (a parent and no kind) is `UNAVAILABLE`: it could be a
 * version, a crop or an unrelated output, and the history never guesses. An
 * asset with no parent, or whose recorded relation makes it a separate asset
 * (a derivative or a source), starts a history of its own.
 */
export function classifyVersionRelation(
  row: Pick<VersionHistoryRow, 'parentId' | 'relationKind'>,
): IngredientVersionRelation {
  if (!row.parentId) {
    return IngredientVersionRelation.ORIGINAL;
  }
  switch (row.relationKind) {
    case IngredientRelationKind.VERSION:
      return IngredientVersionRelation.VERSION;
    case IngredientRelationKind.TRANSFORMATION:
      return IngredientVersionRelation.TRANSFORMATION;
    case IngredientRelationKind.DERIVATIVE:
    case IngredientRelationKind.SOURCE:
      return IngredientVersionRelation.ORIGINAL;
    default:
      return IngredientVersionRelation.UNAVAILABLE;
  }
}

/** Oldest first: the version number, then creation time, then id. */
export function orderVersionHistory<T extends VersionHistoryRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (left, right) =>
      left.version - right.version ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}

/**
 * The active entry: the first asset's explicit choice while that asset is still
 * in the history (live and visible), otherwise the newest entry. A choice that
 * points at an asset that was trashed falls back to the newest instead of at
 * nothing. The choice is read from the first asset of the family even when that
 * asset itself was trashed, so trashing it does not forget the choice.
 */
export function resolveActiveVersionId(
  ordered: readonly VersionHistoryRow[],
  chosenId: string | null | undefined,
): string {
  if (chosenId && ordered.some((row) => row.id === chosenId)) {
    return chosenId;
  }
  return ordered[ordered.length - 1].id;
}
