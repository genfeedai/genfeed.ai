import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import WorkspaceInboxPage, * as PageModule from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('../workspace-page', () => ({
  default: ({
    defaultInboxView,
    section,
  }: {
    defaultInboxView: string;
    section: string;
  }) => (
    <div data-testid="workspace-page">
      {section}:{defaultInboxView}
    </div>
  ),
}));

runPageModuleTests('app/(protected)/workspace/inbox/page', PageModule);

describe('WorkspaceInboxPage', () => {
  it('defaults an unknown view to unread', async () => {
    const page = await WorkspaceInboxPage({
      searchParams: Promise.resolve({ view: 'nope' }),
    });

    render(page);

    expect(screen.getByTestId('workspace-page')).toHaveTextContent(
      'inbox:unread',
    );
  });

  it('keeps an explicit all view', async () => {
    const page = await WorkspaceInboxPage({
      searchParams: Promise.resolve({ view: 'all' }),
    });

    render(page);

    expect(screen.getByTestId('workspace-page')).toHaveTextContent('inbox:all');
  });
});
