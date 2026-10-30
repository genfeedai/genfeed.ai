import type { ViewType } from '@genfeedai/contracts';
import type { ViewOption } from '@genfeedai/props/ui/navigation/view-option.props';

export interface ViewMenuProps<TView extends ViewType = ViewType> {
  /** Layouts this page supports. A single option renders nothing. */
  options: ViewOption<TView>[];
  activeView: TView;
  onChange: (view: TView) => void;
  className?: string;
}
