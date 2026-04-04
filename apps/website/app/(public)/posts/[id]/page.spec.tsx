import * as PageModule from '@public/posts/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/website/app/(public)/posts/[id]/page', PageModule);
