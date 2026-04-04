import * as PageModule from '@protected/overview/analytics/organizations/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/analytics/organizations/[id]/page',
  PageModule,
);
