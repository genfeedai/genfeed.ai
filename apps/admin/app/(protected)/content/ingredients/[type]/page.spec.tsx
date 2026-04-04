import * as PageModule from '@protected/content/ingredients/[type]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/ingredients/[type]/page',
  PageModule,
);
