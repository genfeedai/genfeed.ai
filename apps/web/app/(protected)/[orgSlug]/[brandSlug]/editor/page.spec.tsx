import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests('apps/app/app/(protected)/editor/page', PageModule);
