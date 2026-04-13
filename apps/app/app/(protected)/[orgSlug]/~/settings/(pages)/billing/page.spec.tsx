import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from '../organization/billing/page';

runPageModuleTests(
  'app/(protected)/settings/(pages)/organization/billing/page',
  PageModule,
);
