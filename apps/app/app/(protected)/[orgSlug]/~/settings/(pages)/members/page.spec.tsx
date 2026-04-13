import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/members/page';

runPageModuleTests(
  'app/(protected)/settings/(pages)/organization/members/page',
  PageModule,
);
