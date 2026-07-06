import * as PageModule from '@public/case-studies/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/website/app/(public)/case-studies/[slug]/page',
  PageModule,
);
