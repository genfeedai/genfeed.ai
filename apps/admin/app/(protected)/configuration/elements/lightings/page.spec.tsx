import * as PageModule from '@protected/configuration/elements/lightings/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/lightings/page',
  PageModule,
);
