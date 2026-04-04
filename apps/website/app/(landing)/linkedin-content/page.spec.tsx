import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/website/app/(landing)/linkedin-content/page',
  PageModule,
);
