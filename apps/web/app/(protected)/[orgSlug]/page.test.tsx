import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import OrgLandingPage, * as PageModule from './page';

vi.mock('./org-landing-content', () => ({
  default: () => <div data-testid="org-landing-content" />,
}));

runPageModuleTests('app/(protected)/[orgSlug]/page', PageModule);

describe('OrgLandingPage', () => {
  it('renders the org landing content', () => {
    render(<OrgLandingPage />);

    expect(screen.getByTestId('org-landing-content')).toBeInTheDocument();
  });
});
