import type { ViewType } from '@genfeedai/contracts';
import type { ViewOption } from '@genfeedai/props/ui/navigation/view-option.props';

/**
 * - `icon` — the active layout's icon only (grid, list, table, board).
 * - `label` — the active option's name, for views an icon cannot tell apart
 *   (a calendar's Day, Week, Month).
 */
export type ViewMenuTrigger = 'icon' | 'label';

export interface ViewMenuProps<TView extends string = ViewType> {
  /** Layouts this page supports. A single option renders nothing. */
  options: ViewOption<TView>[];
  activeView: TView;
  onChange: (view: TView) => void;
  trigger?: ViewMenuTrigger;
  className?: string;
}
