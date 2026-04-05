import * as PageModule from '../organization/members/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/organization/members/page',
  PageModule,
);
