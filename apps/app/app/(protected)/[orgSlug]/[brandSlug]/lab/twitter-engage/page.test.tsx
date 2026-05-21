import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LabTwitterEngagePage, * as PageModule from './page';

vi.mock('@pages/twitter-pipeline/twitter-pipeline-engage', () => ({
  default: () => <div data-testid="twitter-engage" />,
}));

runPageModuleTests('app/(protected)/lab/twitter-engage/page', PageModule);

describe('LabTwitterEngagePage', () => {
  it('renders the Twitter engage lab surface', () => {
    render(<LabTwitterEngagePage />);

    expect(screen.getByTestId('twitter-engage')).toBeInTheDocument();
  });
});
