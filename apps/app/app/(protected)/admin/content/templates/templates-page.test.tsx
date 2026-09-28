import { fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
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
