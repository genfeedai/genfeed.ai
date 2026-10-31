import type { PageScope } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';

export interface IngredientsLayoutProps extends LayoutProps {
  scope?: PageScope.ORGANIZATION | PageScope.BRAND;
  /** Default ingredient type when navigated via sidebar (e.g. 'images', 'videos') */
  defaultType?: string;
}
