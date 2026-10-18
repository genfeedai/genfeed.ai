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
    translate,
    getService: vi.fn(async () => service),
  };
});
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

const templates = Array.from({ length: 55 }, (_, index) => ({
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
  mocks.service.getTemplates.mockResolvedValue(templates);
});
describe('admin templates collection', () => {
  it('defaults to 55 navigable rows and persists the grid choice', async () => {
    const user = userEvent.setup();
    const first = render(<TemplatesPage />);
    expect(
      await screen.findByRole('link', { name: 'open Template 0' }),
    ).toHaveAttribute('href', expect.stringContaining('/template-0'));
    expect(screen.getByTestId('templates-list')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(55);
    expect(screen.queryByTestId('template-card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'grid' }));
    expect(screen.getByTestId('templates-grid')).toHaveClass('@container');
    expect(screen.getAllByTestId('template-card')).toHaveLength(55);
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
    expect(mocks.service.getTemplates).toHaveBeenCalledWith({
      includeSystem: true,
    });
    expect(screen.getAllByText('system')).toHaveLength(1);
    expect(screen.getByText('content.video.default')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'open My template' }),
    ).toBeInTheDocument();
  });

  it('filters the loaded templates from the subbar search and refreshes from it', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);
    await screen.findByRole('link', { name: 'open Template 0' });
    await user.type(screen.getByLabelText('search'), 'Template 54');
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() =>
      expect(mocks.service.getTemplates).toHaveBeenCalledTimes(2),
    );
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
