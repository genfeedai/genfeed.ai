import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/[orgSlug]/~/analytics/brands/[id]/page',
  PageModule,
);
