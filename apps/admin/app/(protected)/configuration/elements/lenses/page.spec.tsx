import * as PageModule from '@protected/configuration/elements/lenses/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/lenses/page',
  PageModule,
);
