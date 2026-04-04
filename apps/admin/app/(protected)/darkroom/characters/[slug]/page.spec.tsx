import * as PageModule from '@admin/(protected)/darkroom/characters/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/darkroom/characters/[slug]/page',
  PageModule,
);
