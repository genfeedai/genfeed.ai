import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import type { LayoutProps } from '@props/layout/layout.props';
import { PageScope } from '@ui-constants/misc.constant';

export default function ManagerIngredientsLayout({ children }: LayoutProps) {
  return (
    <IngredientsLayout scope={PageScope.SUPERADMIN}>
      {children}
    </IngredientsLayout>
  );
}
