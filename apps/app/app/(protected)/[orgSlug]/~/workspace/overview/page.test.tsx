import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import OrgWorkspaceOverviewPage, * as PageModule from './page';

vi.mock(
  '@/features/workspace-overview/workspace-overview-surface-adapters',
  () => ({
    OrganizationWorkspaceOverviewSurfaceAdapter: ({
      children,
    }: {
      children: ReactNode;
    }) => <div data-testid="organization-overview-adapter">{children}</div>,
  }),
);

vi.mock(
  '@pages/analytics/organization-overview/analytics-organization-overview',
  () => ({
    default: () => <div data-testid="organization-overview" />,
  }),
);

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  AnalyticsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

runPageModuleTests(
  'app/(protected)/[orgSlug]/~/workspace/overview/page',
  PageModule,
);

describe('OrgWorkspaceOverviewPage', () => {
  it('renders the organization workspace overview surface', () => {
    render(<OrgWorkspaceOverviewPage />);

    expect(screen.getByTestId('organization-overview')).toBeInTheDocument();
    expect(
      screen.getByTestId('organization-overview-adapter'),
    ).toBeInTheDocument();
  });
});
