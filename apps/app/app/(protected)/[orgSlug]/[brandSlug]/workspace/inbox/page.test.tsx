import WorkspaceInboxPage, * as PageModule from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/inbox/page';
import WorkspaceInboxRoute from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/inbox/WorkspaceInboxRoute';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ query: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useSearchParams: () => navigation.query,
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page',
  () => ({
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
  }),
);
runPageModuleTests('app/(protected)/workspace/inbox/page', PageModule);

describe('WorkspaceInboxPage', () => {
  it('renders a synchronous page shell', () => {
    navigation.query = new URLSearchParams();
    render(<WorkspaceInboxPage />);
    expect(screen.getByTestId('workspace-page')).toHaveTextContent(
      'inbox:unread',
    );
  });
  it.each([
    ['view=nope', 'unread'],
    ['view=all', 'all'],
    ['view=recent', 'recent'],
    ['view=all&view=recent', 'unread'],
  ])('keeps the parsing of %s', (query, expected) => {
    navigation.query = new URLSearchParams(query);
    render(<WorkspaceInboxRoute />);
    expect(screen.getByTestId('workspace-page')).toHaveTextContent(
      `inbox:${expected}`,
    );
  });
});
