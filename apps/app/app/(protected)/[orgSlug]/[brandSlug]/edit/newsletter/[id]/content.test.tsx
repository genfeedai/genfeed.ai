import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewsletterEditorContent from './content';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  archive: vi.fn(),
  captureAnalyticsEvent: vi.fn(),
  copyToClipboard: vi.fn(),
  credentials: [] as unknown[],
  deliver: vi.fn(),
  error: vi.fn(),
  findDeliveries: vi.fn(),
  findOne: vi.fn(),
  generateDraft: vi.fn(),
  getContext: vi.fn(),
  loggerError: vi.fn(),
  patch: vi.fn(),
  publish: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    FIRST_SUCCESSFUL_PUBLISH: 'first_successful_publish',
    POST_PUBLISHED: 'post_published',
  },
  captureAnalyticsEvent: mocks.captureAnalyticsEvent,
}));

// The real hook returns a memoized getter; a fresh one per render would
// re-run every effect that depends on it.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const getService = async () => ({
    approve: mocks.approve,
    archive: mocks.archive,
    deliver: mocks.deliver,
    findDeliveries: mocks.findDeliveries,
    findOne: mocks.findOne,
    generateDraft: mocks.generateDraft,
    getContext: mocks.getContext,
    patch: mocks.patch,
    publish: mocks.publish,
  });
  return { useAuthedService: () => getService };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', credentials: mocks.credentials }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/studio${path}` }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard: mocks.copyToClipboard }),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example.test/v1' },
}));

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => {
  // A singleton, like the real service, so effects keyed on it stay settled.
  const notifications = { error: mocks.error, success: mocks.success };
  return { NotificationsService: { getInstance: () => notifications } };
});

const newsletter = {
  angle: 'Operator lessons',
  content: 'Draft body',
  id: 'newsletter-1',
  label: 'Issue 1',
  status: 'ready_for_review',
  summary: 'Draft summary',
  topic: 'AI workflows',
};

describe('NewsletterEditorContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue(newsletter);
    mocks.getContext.mockResolvedValue({
      contextSources: [],
      selectedContext: [],
      selectedContextIds: [],
    });
    mocks.patch.mockResolvedValue({ ...newsletter, label: 'Issue 1 revised' });
    mocks.findDeliveries.mockResolvedValue([]);
    mocks.deliver.mockResolvedValue({ id: 'release-1' });
    mocks.credentials = [];
  });

  it('loads the issue without duplicating workspace navigation', async () => {
    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Issue 1' }),
    ).toBeVisible();
    expect(mocks.findOne).toHaveBeenCalledWith(
      'newsletter-1',
      {},
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Ready For Review')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /back/i }),
    ).not.toBeInTheDocument();
  });

  it('enables saving only once the issue has been edited', async () => {
    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Issue 1' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Newsletter label'), {
      target: { value: 'Issue 1 revised' },
    });

    expect(screen.getByText('Unsaved changes')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('newsletter-1', {
        angle: 'Operator lessons',
        content: 'Draft body',
        label: 'Issue 1 revised',
        summary: 'Draft summary',
        topic: 'AI workflows',
      });
    });
    expect(mocks.success).toHaveBeenCalledWith('Newsletter saved');
  });

  it('shows the Substack import feed and copy-out when no Beehiiv publication is connected', async () => {
    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    expect(await screen.findByText('Import into Substack')).toBeVisible();
    const feedUrl =
      'https://api.example.test/v1/public/rss/brands/brand-1/newsletters';
    expect(screen.getByText(feedUrl)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Copy feed URL' }));
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(feedUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }));
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('Draft body');
    expect(
      screen.getByRole('link', { name: 'Connect an account' }),
    ).toHaveAttribute('href', '/acme/studio/settings/connected-accounts');
  });

  it('sends the issue through the connected Beehiiv publication', async () => {
    mocks.credentials = [
      {
        id: 'beehiiv-1',
        isConnected: true,
        label: 'Weekly',
        platform: 'beehiiv',
      },
    ];

    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deliver to Beehiiv' }),
    );

    await waitFor(() => {
      expect(mocks.deliver).toHaveBeenCalledWith('newsletter-1', {
        credentialId: 'beehiiv-1',
        mode: 'send',
      });
    });
    expect(mocks.success).toHaveBeenCalledWith(
      'Sent to Beehiiv. The issue link appears here when it is ready.',
    );
    await waitFor(() => expect(mocks.findDeliveries).toHaveBeenCalledTimes(2));
  });

  it('explains an issue that could not be loaded', async () => {
    mocks.findOne.mockRejectedValue(new Error('gone'));

    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    expect(await screen.findByText('Newsletter not found')).toBeVisible();
    expect(mocks.error).toHaveBeenCalledWith('Failed to load newsletter');
  });
});
