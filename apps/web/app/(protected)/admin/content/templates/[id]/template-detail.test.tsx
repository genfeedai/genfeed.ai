import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import {
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../messages/en/pages/adminTemplates.json';
import TemplateDetail from './template-detail';

// Stable like the real hook: a new `t` per render re-runs the load effect,
// which resets the template to loading.
const translate = vi.hoisted(
  () => (key: string, values?: Record<string, unknown>) =>
    (messages as Record<string, string>)[key].replace(
      /\{(\w+)\}/g,
      (_, name: string) => String(values?.[name]),
    ),
);

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}));

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  getTemplate: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
}));

const getService = vi.hoisted(() => async () => ({
  getTemplate: mocks.getTemplate,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

const VIDEO_TEMPLATE = {
  category: 'video',
  content: '{{{prompt}}}',
  description: 'Default video prompt',
  id: 'template-1',
  isActive: true,
  key: 'content.video.default',
  label: 'Video default',
  variables: null,
};

describe('TemplateDetail shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading shell immediately while the template is loading', () => {
    mocks.getTemplate.mockReturnValueOnce(new Promise(() => undefined));

    render(<TemplateDetail templateId="template-1" />);

    expect(screen.getByTestId('template-detail-shell')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Template' })).toBeVisible();
    expect(
      screen.queryByText(
        'The template you are looking for does not exist or has been deleted.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the not-found card inside the shell once loading resolves with no template', async () => {
    mocks.getTemplate.mockResolvedValueOnce(null);

    render(<TemplateDetail templateId="template-1" />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'The template you are looking for does not exist or has been deleted.',
        ),
      ).toBeVisible();
    });
    expect(screen.getByTestId('template-detail-shell')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Template' })).toBeVisible();
  });

  it('renders a seeded system template written in the API shape', async () => {
    mocks.getTemplate.mockResolvedValueOnce({
      category: 'video',
      content: '{{{prompt}}}',
      description: 'Default video prompt',
      id: 'template-1',
      isActive: true,
      key: 'content.video.default',
      label: 'Video default',
      variables: null,
    });

    render(<TemplateDetail templateId="template-1" />);

    expect(
      await screen.findByRole('heading', { name: 'Video default' }),
    ).toBeVisible();
    expect(screen.getByText('content.video.default')).toBeVisible();
    expect(screen.getByText('{{{prompt}}}')).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('paints a cached template at once when it is reopened', async () => {
    mocks.getTemplate.mockResolvedValueOnce(VIDEO_TEMPLATE);
    const client = createTestQueryClient();
    const first = render(<TemplateDetail templateId="template-1" />, client);
    await screen.findByRole('heading', { name: 'Video default' });
    first.unmount();

    mocks.getTemplate.mockReturnValue(new Promise(() => undefined));
    render(<TemplateDetail templateId="template-1" />, client);

    expect(
      screen.getByRole('heading', { name: 'Video default' }),
    ).toBeVisible();
    expect(screen.getByText('{{{prompt}}}')).toBeVisible();
  });

  it('never paints one cached template for another', async () => {
    mocks.getTemplate.mockResolvedValueOnce(VIDEO_TEMPLATE);
    const client = createTestQueryClient();
    const first = render(<TemplateDetail templateId="template-1" />, client);
    await screen.findByRole('heading', { name: 'Video default' });
    first.unmount();

    mocks.getTemplate.mockReturnValue(new Promise(() => undefined));
    render(<TemplateDetail templateId="template-2" />, client);

    expect(screen.getByRole('heading', { name: 'Template' })).toBeVisible();
    expect(screen.queryByText('Video default')).not.toBeInTheDocument();
  });

  it('sends the operator back to the list when the template cannot be read', async () => {
    mocks.getTemplate.mockRejectedValueOnce(new Error('gone'));

    render(<TemplateDetail templateId="template-1" />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/admin/content/templates');
    });
    expect(mocks.error).toHaveBeenCalledWith('Failed to load template');
  });
});
