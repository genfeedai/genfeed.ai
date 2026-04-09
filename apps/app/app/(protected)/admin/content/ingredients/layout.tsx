import { PageScope } from '@genfeedai/enums';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import type { LayoutProps } from '@props/layout/layout.props';

export default function ManagerIngredientsLayout({ children }: LayoutProps) {
  return (
    <IngredientsLayout scope={PageScope.SUPERADMIN}>
      {children}
    </IngredientsLayout>
  );
}
