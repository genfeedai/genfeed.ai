import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ReactNode } from 'react';
import * as PageModule from './page';

vi.mock(
  '@/features/workspace-overview/workspace-overview-surface-adapters',
  () => ({
    BrandWorkspaceOverviewSurfaceAdapter: ({
      children,
    }: {
      children: ReactNode;
    }) => children,
  }),
);

runPageModuleTests('app/(protected)/workspace/overview/page', PageModule);
