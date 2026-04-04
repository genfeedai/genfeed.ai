import * as PageModule from '@protected/configuration/elements/cameras/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/cameras/page',
  PageModule,
);
