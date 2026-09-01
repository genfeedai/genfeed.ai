import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewsletterEditorContent from './content';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  archive: vi.fn(),
  captureAnalyticsEvent: vi.fn(),
  error: vi.fn(),
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

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    approve: mocks.approve,
    archive: mocks.archive,
    findOne: mocks.findOne,
    generateDraft: mocks.generateDraft,
    getContext: mocks.getContext,
    patch: mocks.patch,
    publish: mocks.publish,
  }),
}));

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.error, success: mocks.success }),
  },
}));

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

  it('explains an issue that could not be loaded', async () => {
    mocks.findOne.mockRejectedValue(new Error('gone'));

    render(<NewsletterEditorContent artifactId="newsletter-1" />);

    expect(await screen.findByText('Newsletter not found')).toBeVisible();
    expect(mocks.error).toHaveBeenCalledWith('Failed to load newsletter');
  });
});
