import * as PageModule from '@public/best/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/website/app/(public)/best/[slug]/page', PageModule);
