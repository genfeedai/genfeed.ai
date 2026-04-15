import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/settings/(pages)/organization/page',
  PageModule,
);
