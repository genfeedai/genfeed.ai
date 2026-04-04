import * as PageModule from '../organization/billing/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/organization/billing/page',
  PageModule,
);
