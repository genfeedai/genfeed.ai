import * as PageModule from '@admin/(protected)/darkroom/infrastructure/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/darkroom/infrastructure/page',
  PageModule,
);
