import * as PageModule from '@admin/(protected)/darkroom/training/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/darkroom/training/page',
  PageModule,
);
