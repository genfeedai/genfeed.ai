import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import WorkspaceInboxPage, * as PageModule from './page';

vi.mock('../workspace-page', () => ({
  default: ({ section }: { section: string }) => (
    <div data-testid="workspace-page">{section}</div>
  ),
}));

runPageModuleTests('app/(protected)/workspace/inbox/page', PageModule);

describe('WorkspaceInboxPage', () => {
  it('renders the inbox section', () => {
    render(<WorkspaceInboxPage />);

    expect(screen.getByTestId('workspace-page')).toHaveTextContent('inbox');
  });
});
