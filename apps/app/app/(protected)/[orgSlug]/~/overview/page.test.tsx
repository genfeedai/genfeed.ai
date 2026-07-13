import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import OrgOverviewPage, * as PageModule from './page';

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

runPageModuleTests('app/(protected)/[orgSlug]/~/overview/page', PageModule);

describe('OrgOverviewPage', () => {
  it('renders the organization overview surface', () => {
    render(<OrgOverviewPage />);

    expect(screen.getByTestId('organization-overview')).toBeInTheDocument();
    expect(
      screen.getByTestId('organization-overview-adapter'),
    ).toBeInTheDocument();
  });
});
