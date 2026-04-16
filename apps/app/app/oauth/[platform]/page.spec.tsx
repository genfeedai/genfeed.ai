import * as PageModule from '@app/oauth/[platform]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('app/oauth/[platform]/page', PageModule);
