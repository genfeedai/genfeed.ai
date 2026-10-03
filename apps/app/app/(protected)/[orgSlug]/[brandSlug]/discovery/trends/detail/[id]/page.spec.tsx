import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/discovery/trends/detail/[id]/page',
  PageModule,
);
