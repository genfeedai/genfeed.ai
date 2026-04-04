import * as PageModule from '@public/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/website/app/(public)/[slug]/page', PageModule);
