import * as PageModule from '@admin/(protected)/crm/leads/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/crm/leads/[id]/page',
  PageModule,
);
