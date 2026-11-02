import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { Article } from '@models/content/article.model';
import { act, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PropsWithChildren, ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import ArticleTrafficPanel from './article-traffic-panel';

const pagesMessages = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../messages/en/pages/articles.json',
    ),
    'utf8',
  ),
);
function IntlWrapper({ children }: PropsWithChildren) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ pages: { articles: pagesMessages } }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
function render(ui: ReactElement, client = createTestQueryClient()) {
  const QueryWrapper = queryClientWrapper(client);
  return rtlRender(ui, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryWrapper>
        <IntlWrapper>{children}</IntlWrapper>
      </QueryWrapper>
    ),
  });
}

const getWebsiteTraffic = vi.fn();
const getService = async () => ({ getWebsiteTraffic });
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ organizationId: 'org-1', brandId: 'brand-1' }),
}));
vi.mock('next/dynamic', () => ({
  default: () => () => <div>Daily traffic chart</div>,
}));
const article = { id: 'article-1', label: 'Reviewed guide' } as Article;
const available = {
  articleId: 'article-1',
  status: 'available',
  reason: null,
  period: '30d',
  totalViews: 0,
  totalResourceClicks: 0,
  days: [],
};
beforeEach(() => {
  vi.clearAllMocks();
});

it('renders verified zero totals after a successful query', async () => {
  getWebsiteTraffic.mockResolvedValue(available);
  render(<ArticleTrafficPanel article={article} />);
  await screen.findByText('Website views');
  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.getByText('Daily traffic chart')).toBeInTheDocument();
});

it('renders missing configuration as unavailable without zero totals', async () => {
  getWebsiteTraffic.mockResolvedValue({
    ...available,
    status: 'unavailable',
    reason: 'not_configured',
    totalViews: null,
    totalResourceClicks: null,
  });
  render(<ArticleTrafficPanel article={article} />);
  await screen.findByText(
    'Website traffic reporting is not configured for this workspace yet.',
  );
  expect(screen.queryByText('Website views')).not.toBeInTheDocument();
  expect(screen.queryByText('0')).not.toBeInTheDocument();
});

it('aborts the old range and ignores its result after switching periods', async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  getWebsiteTraffic
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...available, totalViews: 7 });
  render(<ArticleTrafficPanel article={article} />);
  await screen.findByRole('status', { name: 'Loading website traffic…' });
  await userEvent.click(screen.getByRole('radio', { name: '7 days' }));
  await screen.findByText('7');
  expect(getWebsiteTraffic.mock.calls[0][2].aborted).toBe(true);
  expect(getWebsiteTraffic.mock.calls[1][1]).toBe('7d');
  await act(async () => {
    resolveFirst({ ...available, totalViews: 999 });
  });
  expect(screen.queryByText('999')).not.toBeInTheDocument();
});

it('recovers from a failed request when the reader retries', async () => {
  getWebsiteTraffic
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(available);
  render(<ArticleTrafficPanel article={article} />);
  await screen.findByText('Unable to load article traffic.');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Website views');
  expect(getWebsiteTraffic).toHaveBeenCalledTimes(2);
});

it('links the header to the article editor and lists the article facts', async () => {
  getWebsiteTraffic.mockResolvedValue(available);
  render(
    <ArticleTrafficPanel
      article={
        { ...article, author: 'vincent', status: 'draft' } as unknown as Article
      }
      openHref="/acme/news/publishing/posts/article-1"
      openLabel="Open Reviewed guide"
    />,
  );
  await screen.findByText('Website views');
  expect(
    screen.getByRole('link', { name: 'Open Reviewed guide' }),
  ).toHaveAttribute('href', '/acme/news/publishing/posts/article-1');
  expect(screen.getByText('vincent')).toBeInTheDocument();
});

it('paints the traffic it already loaded straight away when the article is reopened', async () => {
  getWebsiteTraffic.mockResolvedValue({ ...available, totalViews: 42 });
  const client = createTestQueryClient();
  const firstOpen = render(<ArticleTrafficPanel article={article} />, client);
  await screen.findByText('42');
  firstOpen.unmount();

  getWebsiteTraffic.mockReturnValue(new Promise(() => {}));
  render(<ArticleTrafficPanel article={article} />, client);

  expect(screen.getByText('42')).toBeInTheDocument();
  expect(
    screen.queryByRole('status', { name: 'Loading website traffic…' }),
  ).not.toBeInTheDocument();
});
