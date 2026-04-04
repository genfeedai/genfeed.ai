import * as PageModule from '@admin/(protected)/crm/companies/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/crm/companies/[id]/page',
  PageModule,
);
