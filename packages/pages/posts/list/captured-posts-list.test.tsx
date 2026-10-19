import {
  CredentialPlatform,
  PageScope,
  PostVisibility,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CapturedPostsList from './captured-posts-list';

const findAllPageMock = vi.fn();
const setRefreshMock = vi.fn();
const onPageChange = vi.fn();

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ activeHref: (path: string) => `/acme/~${path}` }),
}));

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  ContextSidebarPanel: ({
    children,
    selection,
  }: {
    children: ReactNode;
    selection: { kind: string; title: string } | null;
  }) =>
    selection ? (
      <aside data-kind={selection.kind} data-testid="context-sidebar">
        <h2>{selection.title}</h2>
        {children}
      </aside>
    ) : null,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ findAllPage: findAllPageMock }),
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({ setRefresh: setRefreshMock }),
}));

function capturedPost(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-10-01T10:00:00.000Z',
    description: 'Shipping the extension today',
    id: 'post-1',
    label: 'Shipping the extension',
    platform: CredentialPlatform.TWITTER,
    publicationDate: '2026-10-01T09:00:00.000Z',
    source: 'extension',
    visibility: PostVisibility.PRIVATE,
    ...overrides,
  };
}

function page(posts: unknown[]) {
  return {
    hasNext: false,
    hasPrevious: false,
    items: posts,
    page: 1,
    pageSize: ITEMS_PER_PAGE,
    total: posts.length,
    totalPages: 1,
  };
}

function renderList(
  props: Partial<React.ComponentProps<typeof CapturedPostsList>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <CapturedPostsList
      currentPage={1}
      onPageChange={onPageChange}
      scope={PageScope.PUBLISHING}
      search=""
      sort="createdAt: -1"
      {...props}
    />,
    { wrapper },
  );
}

describe('CapturedPostsList', () => {
  beforeEach(() => {
    findAllPageMock.mockReset();
    setRefreshMock.mockReset();
    onPageChange.mockReset();
  });

  it('requests only extension-sourced posts in the active organization and brand', async () => {
    findAllPageMock.mockResolvedValue(page([capturedPost()]));

    renderList({ platform: CredentialPlatform.TWITTER, search: 'ship' });

    await screen.findByText('Shipping the extension');
    expect(findAllPageMock).toHaveBeenCalledOnce();
    expect(findAllPageMock.mock.calls[0][0]).toEqual({
      brandId: 'brand-1',
      limit: ITEMS_PER_PAGE,
      organizationId: 'org-1',
      page: 1,
      platform: CredentialPlatform.TWITTER,
      search: 'ship',
      sort: 'createdAt: -1',
      source: 'extension',
    });
    expect(findAllPageMock.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it('shows observed and unavailable audiences without any release action', async () => {
    findAllPageMock.mockResolvedValue(
      page([
        capturedPost(),
        capturedPost({
          credentialId: undefined,
          description: 'Reply with no observed audience',
          id: 'post-2',
          label: 'Reply with no observed audience',
          visibility: null,
        }),
        capturedPost({
          description: 'Unlisted video',
          id: 'post-3',
          label: 'Unlisted video',
          visibility: PostVisibility.UNLISTED,
        }),
      ]),
    );

    renderList();

    await screen.findByText('Reply with no observed audience');
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Unlisted')).toBeInTheDocument();
    expect(screen.getByText('Audience unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Extension')).toHaveLength(3);
    // Observed records are read-only: nothing to schedule, retry or reschedule.
    expect(
      screen.queryByRole('button', { name: /schedule|retry|publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Open analytics for Shipping the extension',
      }),
    ).toHaveAttribute('href', '/acme/~/analytics/posts?postId=post-1');
  });

  it('opens a read-only summary in the sidebar from the row, not from the name link', async () => {
    findAllPageMock.mockResolvedValue(page([capturedPost()]));

    renderList();

    const link = await screen.findByRole('link', {
      name: 'Open analytics for Shipping the extension',
    });
    fireEvent.click(link);
    expect(screen.queryByTestId('table-row-summary')).not.toBeInTheDocument();

    const row = link.closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('Extension'));

    const sidebar = await screen.findByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'post');
    expect(within(sidebar).getByTestId('table-row-summary')).toHaveTextContent(
      'Shipping the extension today',
    );
  });

  it('does not ask the API for lifecycle filters no captured post can match', async () => {
    renderList({ publicationState: 'not-posted' });

    await screen.findByText('No captured publications');
    expect(findAllPageMock).not.toHaveBeenCalled();
  });

  it('reports a load failure with a retry instead of an empty list', async () => {
    findAllPageMock.mockRejectedValueOnce(new Error('boom'));

    renderList();

    expect(
      await screen.findByText(
        'Captured publications could not be loaded. Refresh to try again.',
      ),
    ).toBeInTheDocument();
    findAllPageMock.mockResolvedValueOnce(page([capturedPost()]));
    screen.getByRole('button', { name: 'Try again' }).click();
    await waitFor(() =>
      expect(screen.getByText('Shipping the extension')).toBeInTheDocument(),
    );
  });

  it('owns the layout refresh action while mounted and releases it on leave', async () => {
    findAllPageMock.mockResolvedValue(page([]));

    const { unmount } = renderList();
    await screen.findByText('No captured publications');

    expect(setRefreshMock).toHaveBeenCalled();
    const registered = setRefreshMock.mock.calls[0][0]() as () => void;
    registered();
    await waitFor(() => expect(findAllPageMock).toHaveBeenCalledTimes(2));
    unmount();
    expect(setRefreshMock).toHaveBeenCalledTimes(2);
  });
});
