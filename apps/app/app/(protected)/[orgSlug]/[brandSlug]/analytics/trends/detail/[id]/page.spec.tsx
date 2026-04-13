import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/analytics/trends/detail/[id]/page',
  PageModule,
);
