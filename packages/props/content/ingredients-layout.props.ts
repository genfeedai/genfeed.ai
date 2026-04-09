import type { PageScope } from '@genfeedai/enums';
import type { LayoutProps } from '@props/layout/layout.props';

export interface IngredientsLayoutProps extends LayoutProps {
  scope?: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
  /** Default ingredient type when navigated via sidebar (e.g. 'images', 'videos') */
  defaultType?: string;
  /** When true, hides the type tabs — sidebar provides navigation instead */
  hideTypeTabs?: boolean;
}
