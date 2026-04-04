import * as PageModule from '../organization/api-keys/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/organization/api-keys/page',
  PageModule,
);
