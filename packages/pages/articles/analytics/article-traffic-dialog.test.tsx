import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Article } from '@models/content/article.model';
import { act, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { PropsWithChildren, ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import ArticleTrafficDialog from './article-traffic-dialog';

const pagesMessages = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../apps/app/messages/en/pages.json',
    ),
    'utf8',
  ),
);
function IntlWrapper({ children }: PropsWithChildren) {
  return (
    <NextIntlClientProvider locale="en" messages={{ pages: pagesMessages }}>
      {children}
    </NextIntlClientProvider>
  );
}
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: IntlWrapper });
}

const getWebsiteTraffic = vi.fn();
const getService = async () => ({ getWebsiteTraffic });
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
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
  render(<ArticleTrafficDialog article={article} onClose={vi.fn()} />);
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
  render(<ArticleTrafficDialog article={article} onClose={vi.fn()} />);
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
  render(<ArticleTrafficDialog article={article} onClose={vi.fn()} />);
  await screen.findByText('Loading website traffic…');
  await userEvent.click(screen.getByRole('button', { name: '7 days' }));
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
  render(<ArticleTrafficDialog article={article} onClose={vi.fn()} />);
  await screen.findByText('Unable to load article traffic.');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Website views');
  expect(getWebsiteTraffic).toHaveBeenCalledTimes(2);
});
