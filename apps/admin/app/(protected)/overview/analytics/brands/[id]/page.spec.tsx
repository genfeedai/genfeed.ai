import * as PageModule from '@protected/overview/analytics/brands/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/analytics/brands/[id]/page',
  PageModule,
);
