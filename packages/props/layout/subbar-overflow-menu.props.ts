import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { Ref } from 'react';

/**
 * The "..." menu of a subbar: the page's secondary actions (download, export,
 * import). It is always the first control of the bar's right cluster. Refresh
 * is not in it; Refresh has its own visible icon right after it.
 */
export interface SubbarOverflowMenuProps {
  /** Secondary actions. The menu renders nothing when there are none. */
  actions: readonly CollectionOverflowAction[];
  /** Accessible name of the trigger. Defaults to the localized "More actions". */
  label?: string;
  /** Lets a dialog opened from a menu action return focus to the trigger. */
  triggerRef?: Ref<HTMLButtonElement>;
}
