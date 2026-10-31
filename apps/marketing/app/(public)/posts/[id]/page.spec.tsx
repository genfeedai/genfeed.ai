import * as PageModule from '@public/posts/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/marketing/app/(public)/posts/[id]/page', PageModule);
