import * as PageModule from '@protected/configuration/elements/blacklists/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/blacklists/page',
  PageModule,
);
