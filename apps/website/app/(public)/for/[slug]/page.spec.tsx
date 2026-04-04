import * as PageModule from '@public/for/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/website/app/(public)/for/[slug]/page', PageModule);
