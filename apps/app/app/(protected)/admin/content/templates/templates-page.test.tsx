import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = {
    getTemplates: vi.fn(),
    findCatalog: vi.fn(),
    patchCatalogVoice: vi.fn(),
    importCatalogVoices: vi.fn(),
  };
  const notifications = { error: vi.fn(), success: vi.fn() };
  const translate = (key: string, values?: Record<string, unknown>) =>
    values?.name ? `${key} ${values.name}` : key;
  return {
    service,
    notifications,
    replace: vi.fn(),
    searchParams: new URLSearchParams(),
    translate,
    getService: vi.fn(async () => service),
  };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/templates',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    filters,
    onRefresh,
    search,
    title,
  }: {
    children: ReactNode;
    filters?: ReactNode;
    onRefresh?: () => void;
    search?: ReactNode;
    title: string;
  }) => (
    <main>
      <div data-testid="subbar">
        <h1 className="sr-only">{title}</h1>
        {search}
        {filters}
        <button type="button" onClick={onRefresh}>
          refresh
        </button>
      </div>
      <div data-testid="content">{children}</div>
    </main>
  ),
}));

vi.mock('@services/content/template.service', () => ({ TemplateService: {} }));

import TemplatesPage from './templates-page';

const templates = Array.from({ length: 15 }, (_, index) => ({
  id: `template-${index}`,
  name: `Template ${index}`,
  description: 'Reusable draft',
  variables: [{ name: 'topic' }],
  isActive: true,
  category: 'social',
  performance: { usageCount: 3 },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.searchParams = new URLSearchParams();
  mocks.service.getTemplates.mockResolvedValue(templates);
});
describe('admin templates collection', () => {
  it('renders one page of navigable rows and persists the grid choice', async () => {
    const user = userEvent.setup();
    const first = render(<TemplatesPage />);
    expect(
      await screen.findByRole('link', { name: 'open Template 0' }),
    ).toHaveAttribute('href', expect.stringContaining('/template-0'));
    expect(screen.getByTestId('templates-list')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(15);
    expect(screen.queryByTestId('template-card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'grid' }));
    expect(screen.getByTestId('templates-grid')).toHaveClass('@container');
    expect(screen.getAllByTestId('template-card')).toHaveLength(15);
    first.unmount();
    render(<TemplatesPage />);
    expect(await screen.findByTestId('templates-grid')).toBeInTheDocument();
  });
  it('renders no in-content header: the breadcrumb is the title and the toggle lives in the subbar', async () => {
    render(<TemplatesPage />);
    await screen.findByTestId('templates-list');
    expect(screen.queryByText('catalog')).not.toBeInTheDocument();
    expect(screen.queryByText('description')).not.toBeInTheDocument();
    const content = screen.getByTestId('content');
    expect(within(content).queryAllByRole('heading')).toHaveLength(0);
    expect(
      within(screen.getByTestId('subbar')).getByRole('radio', { name: 'grid' }),
    ).toBeInTheDocument();
    expect(
      within(content).queryByRole('radio', { name: 'grid' }),
    ).not.toBeInTheDocument();
  });

  it('asks for the system templates too and labels them', async () => {
    mocks.service.getTemplates.mockResolvedValue([
      {
        id: 'sys-1',
        label: 'Video default',
        key: 'content.video.default',
        description: 'Default video prompt',
        category: 'video',
        isActive: true,
        variables: [{ name: 'prompt' }],
        content: '{{{prompt}}}',
      },
      {
        id: 'org-1',
        label: 'My template',
        organization: 'org-1',
        category: 'social-media',
        variables: null,
        content: 'Hi {{name}}',
      },
    ]);
    render(<TemplatesPage />);
    expect(
      await screen.findByRole('link', { name: 'open Video default' }),
    ).toBeInTheDocument();
    expect(mocks.service.getTemplates).toHaveBeenCalledWith(
      { includeSystem: true, limit: 15, page: 1 },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByText('system')).toHaveLength(1);
    expect(screen.getByText('content.video.default')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'open My template' }),
    ).toBeInTheDocument();
  });

  it('asks the API for the page and search in the URL instead of filtering the page', async () => {
    mocks.searchParams = new URLSearchParams('page=3&q=tweet');
    render(<TemplatesPage />);
    await screen.findByRole('link', { name: 'open Template 0' });
    expect(mocks.service.getTemplates).toHaveBeenCalledWith(
      { includeSystem: true, limit: 15, page: 3, search: 'tweet' },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole('link')).toHaveLength(15);
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('writes a search to the URL and returns to page 1', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    render(<TemplatesPage />);
    await screen.findByRole('link', { name: 'open Template 0' });
    const input = screen.getByLabelText('search');
    fireEvent.change(input, { target: { value: 'sunset' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/admin/content/templates?q=sunset',
        { scroll: false },
      ),
    );
  });

  it('refreshes from the subbar', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);
    await screen.findByRole('link', { name: 'open Template 0' });
    await user.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() =>
      expect(mocks.service.getTemplates).toHaveBeenCalledTimes(2),
    );
  });

  it('shows no active badge for a template that never had the flag', async () => {
    mocks.service.getTemplates.mockResolvedValue([
      { id: 'legacy', label: 'Legacy prompt', isActive: null },
    ]);
    render(<TemplatesPage />);
    await screen.findByRole('link', { name: 'open Legacy prompt' });
    expect(screen.queryByText('inactive')).not.toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('mirrors the stored grid view while loading', () => {
    localStorage.setItem(
      'genfeed:collection-view:admin.content.templates',
      'grid',
    );
    mocks.service.getTemplates.mockReturnValue(new Promise(() => {}));
    render(<TemplatesPage />);
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(6);
    expect(screen.queryByTestId('list-rows-skeleton')).not.toBeInTheDocument();
  });
  it('shows a retryable error separately from an empty catalog', async () => {
    mocks.service.getTemplates
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    render(<TemplatesPage />);
    expect(await screen.findByText('loadError')).toBeInTheDocument();
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByText('empty')).toBeInTheDocument();
    expect(mocks.service.getTemplates).toHaveBeenCalledTimes(2);
  });
});
