import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/api-keys/page';

runPageModuleTests(
  'app/(protected)/settings/(pages)/organization/api-keys/page',
  PageModule,
);
