/**
 * MongoDB sort object used across controllers and services.
 * Keys are field names, values are sort direction (1 = ascending, -1 = descending).
 */
export interface SortObject {
  [key: string]: 1 | -1;
}
