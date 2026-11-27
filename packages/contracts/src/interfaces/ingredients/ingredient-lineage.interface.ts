import type { IngredientVersionRelation } from '../..';
import type { IIngredient } from './ingredient.interface';

/**
 * One page of an asset's lineage in a single direction.
 *
 * `items` are the accessible assets only. A reference the member cannot see is
 * never listed or named: it only raises `hiddenCount`. A reference in Trash is
 * listed as a stub (`isDeleted: true`) with no media, name or prompt.
 */
export interface IIngredientLineagePage {
  items: IIngredient[];
  /** Related assets outside the member's organization or brand access. */
  hiddenCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

/** One asset in a version history, oldest first by `number`. */
export interface IIngredientVersionEntry {
  id: string;
  /** 1-based position in the history; stable for the same history. */
  number: number;
  /** What created this entry. */
  relation: IngredientVersionRelation;
  isActive: boolean;
}

/**
 * The ordered versions of an asset and which one is active. `items` are the
 * assets themselves, in the same order as `versions`.
 */
export interface IIngredientVersionHistory {
  /** The asset the history was read from. */
  ingredientId: string;
  /** The first asset of the history. */
  rootId: string;
  activeVersionId: string;
  /** False when the asset was linked before relations were recorded. */
  isLineageAvailable: boolean;
  versions: IIngredientVersionEntry[];
  items: IIngredient[];
}
