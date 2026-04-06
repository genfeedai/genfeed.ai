import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/members/page';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/organization/members/page',
  PageModule,
);
