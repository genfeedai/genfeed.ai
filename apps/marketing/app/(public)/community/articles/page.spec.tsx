import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'apps/marketing/app/(public)/community/articles/page',
  PageModule,
);
