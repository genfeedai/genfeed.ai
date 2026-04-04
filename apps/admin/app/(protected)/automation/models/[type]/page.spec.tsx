import * as PageModule from '@protected/automation/models/[type]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/admin/app/(protected)/models/[type]/page', PageModule);
