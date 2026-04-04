import * as PageModule from '@protected/automation/trainings/[id]/sources/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/trainings/[id]/sources/page',
  PageModule,
);
