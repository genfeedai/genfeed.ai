import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import * as PageModule from './page';

runPageModuleTests('app/(protected)/studio/clips/new/page', PageModule);
