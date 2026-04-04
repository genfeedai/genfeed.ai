import * as PageModule from './page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/app/app/(protected)/settings/models/[type]/page',
  PageModule,
);
