import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import OrgAnalyticsOverviewPage, * as PageModule from './page';

vi.mock(
  '@pages/analytics/organization-overview/analytics-organization-overview',
  () => ({
    default: () => <div data-testid="organization-analytics-overview" />,
  }),
);

runPageModuleTests(
  'app/(protected)/[orgSlug]/~/analytics/overview/page',
  PageModule,
);

describe('OrgAnalyticsOverviewPage', () => {
  it('renders the organization analytics overview surface', () => {
    render(<OrgAnalyticsOverviewPage />);

    expect(
      screen.getByTestId('organization-analytics-overview'),
    ).toBeInTheDocument();
  });
});
