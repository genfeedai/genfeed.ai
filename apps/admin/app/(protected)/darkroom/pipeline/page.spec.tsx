import * as PageModule from '@admin/(protected)/darkroom/pipeline/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/darkroom/pipeline/page',
  PageModule,
);
