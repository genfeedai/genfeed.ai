import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/analytics/brands/[id]/platforms/[platform]/page',
  PageModule,
);
