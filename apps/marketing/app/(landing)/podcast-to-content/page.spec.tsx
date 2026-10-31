import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/marketing/app/(landing)/podcast-to-content/page',
  PageModule,
);
