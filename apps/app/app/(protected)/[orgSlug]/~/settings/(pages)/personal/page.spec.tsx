import * as PageModule from './page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/app/app/(protected)/settings/(pages)/personal/page',
  PageModule,
);
