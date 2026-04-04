import type { LayoutProps } from '@props/layout/layout.props';
import type { PageScope } from '@ui-constants/misc.constant';

export interface IngredientsLayoutProps extends LayoutProps {
  scope?: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
  /** Default ingredient type when navigated via sidebar (e.g. 'images', 'videos') */
  defaultType?: string;
  /** When true, hides the type tabs — sidebar provides navigation instead */
  hideTypeTabs?: boolean;
}
