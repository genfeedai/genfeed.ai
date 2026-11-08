import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/marketing/app/creator-profile/[handle]/(showcase)/page',
  PageModule,
);
