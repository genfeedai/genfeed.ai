import * as PageModule from '@protected/overview/analytics/organizations/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/analytics/organizations/page',
  PageModule,
);
