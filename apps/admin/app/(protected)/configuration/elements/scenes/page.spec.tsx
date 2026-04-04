import * as PageModule from '@protected/configuration/elements/scenes/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/scenes/page',
  PageModule,
);
