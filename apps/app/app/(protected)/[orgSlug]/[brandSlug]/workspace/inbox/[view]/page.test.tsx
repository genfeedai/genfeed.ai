import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import WorkspaceInboxViewPage, * as PageModule from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('../../workspace-page', () => ({
  default: ({ defaultInboxView }: { defaultInboxView: string }) => (
    <div data-testid="workspace-page">{defaultInboxView}</div>
  ),
}));

runPageModuleTests('app/(protected)/workspace/inbox/[view]/page', PageModule);

describe('WorkspaceInboxViewPage', () => {
  it('renders the requested inbox view', async () => {
    const page = await WorkspaceInboxViewPage({
      params: Promise.resolve({ view: 'unread' }),
    });

    render(page);

    expect(screen.getByTestId('workspace-page')).toHaveTextContent('unread');
  });
});
