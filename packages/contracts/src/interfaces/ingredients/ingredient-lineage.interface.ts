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
