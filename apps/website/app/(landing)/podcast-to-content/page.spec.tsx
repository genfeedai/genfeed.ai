import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/website/app/(landing)/podcast-to-content/page',
  PageModule,
);
