import type { IPlatformElement } from '@genfeedai/contracts/interfaces';
import type { SummaryFact } from '@genfeedai/props/ui/display/table-row-summary.props';

/** A catalog element (camera, lens, mood, ...) a table row stands for. */
export type ElementRowSidebarItem = IPlatformElement & { id: string };

export interface ElementRowSidebarConfig<T extends ElementRowSidebarItem> {
  /** Facts specific to the element type (models, category). */
  getExtraFacts?: (item: T) => SummaryFact[];
  /**
   * Saves a partial update of the element. When given, label, key,
   * description, active and sort order are edited in place in the sidebar;
   * omit for read-only (non-admin) scopes.
   */
  onSave?: (item: T, patch: Partial<IPlatformElement>) => Promise<void>;
}
