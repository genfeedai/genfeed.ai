import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import OrgOverviewPage, * as PageModule from './page';

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
  });
});
