import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { render, screen } from '@testing-library/react';
import OrganizationMessagesPage, * as PageModule from './page';

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: () => <div>Loading messages</div>,
}));

vi.mock('../../[brandSlug]/messages/messages-page', () => ({
  default: () => <div data-testid="messages-page">Messages</div>,
}));

assertSourceHasExport('app/(protected)/[orgSlug]/~/messages/page.tsx');

runPageModuleTests('app/(protected)/[orgSlug]/~/messages/page', PageModule);

describe('OrganizationMessagesPage', () => {
  it('renders the shared Messages surface at org scope', () => {
    render(<OrganizationMessagesPage />);

    expect(screen.getByTestId('messages-page')).toBeInTheDocument();
  });
});
