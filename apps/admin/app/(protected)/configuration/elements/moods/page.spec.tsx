import * as PageModule from '@protected/configuration/elements/moods/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/elements/moods/page',
  PageModule,
);
