import type { IPlatformElement } from '@genfeedai/contracts/interfaces';
import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';

/** A catalog element (camera, lens, mood, ...) a table row stands for. */
export type ElementRowSidebarItem = IPlatformElement & { id: string };

export interface ElementRowSidebarConfig<T extends ElementRowSidebarItem> {
  /** Facts specific to the element type (models, category). */
  getExtraFacts?: (item: T) => RecordFact[];
  /** Opens the element's edit modal. Omit for read-only (non-admin) scopes. */
  onEdit?: (item: T) => void;
}
