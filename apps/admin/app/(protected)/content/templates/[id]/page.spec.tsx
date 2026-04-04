import * as PageModule from '@protected/content/templates/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/templates/[id]/page',
  PageModule,
);
