import * as PageModule from '@protected/automation/trainings/[id]/images/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/trainings/[id]/images/page',
  PageModule,
);
