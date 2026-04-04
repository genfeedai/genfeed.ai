import * as PageModule from '@protected/configuration/tags/[filter]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/admin/app/(protected)/tags/[filter]/page', PageModule);
