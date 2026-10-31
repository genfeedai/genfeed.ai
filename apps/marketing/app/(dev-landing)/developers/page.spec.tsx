import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/marketing/app/(dev-landing)/developers/page',
  PageModule,
);
