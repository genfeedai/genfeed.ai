import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/credits/page';

runPageModuleTests(
  'app/(protected)/settings/(pages)/organization/credits/page',
  PageModule,
);
