import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/api-keys/page';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/organization/api-keys/page',
  PageModule,
);
