import * as PageModule from '@protected/content/posts/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/admin/app/(protected)/posts/[id]/page', PageModule);
