import * as PageModule from '@protected/automation/workflows/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/admin/app/(protected)/workflows/page', PageModule);
