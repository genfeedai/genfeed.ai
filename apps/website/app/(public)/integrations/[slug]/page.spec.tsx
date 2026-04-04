import * as PageModule from '@public/integrations/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/website/app/(public)/integrations/[slug]/page',
  PageModule,
);
