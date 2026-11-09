import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { viewerKeyPart } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Newsletter } from '@models/content/newsletter.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewsletterSendCard from '@/features/newsletter/send/NewsletterSendCard';

const mocks = vi.hoisted(() => ({
  controlSend: vi.fn(),
  error: vi.fn(),
  getSubscriberStats: vi.fn(),
  listSends: vi.fn(),
  patch: vi.fn(),
  sendIssue: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const getService = async () => ({ patch: mocks.patch });
  return { useAuthedService: () => getService };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/studio${path}` }),
}));

vi.mock('@services/content/newsletter-module.service', () => {
  const service = {
    controlSend: mocks.controlSend,
    getSubscriberStats: mocks.getSubscriberStats,
    listSends: mocks.listSends,
    sendIssue: mocks.sendIssue,
  };
  return { NewsletterModuleService: { getInstance: () => service } };
});

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => {
  const notifications = { error: mocks.error, success: mocks.success };
  return { NotificationsService: { getInstance: () => notifications } };
});

const STATS = {
  active: 3,
  bounced: 0,
  complained: 0,
  pending: 1,
  total: 4,
  unsubscribed: 0,
};

const EMPTY_SENDS = {
  hasNext: false,
  hasPrevious: false,
  items: [],
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
};

function issue(overrides: Partial<Newsletter> = {}): Newsletter {
  return {
    accessLevel: 'public',
    content: 'Issue body',
    id: 'newsletter-1',
    status: 'approved',
    ...overrides,
  } as Newsletter;
}

function renderCard(
  newsletter: Newsletter,
  isDirty = false,
  queryClient = createTestQueryClient(),
) {
  return render(
    <NewsletterSendCard isDirty={isDirty} newsletter={newsletter} />,
    {
      wrapper: queryClientWrapper(queryClient),
    },
  );
}

function issueKey(userId: string, orgId: string) {
  return ['newsletter', 'newsletter-1', viewerKeyPart(userId, orgId)];
}

describe('NewsletterSendCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubscriberStats.mockResolvedValue(STATS);
    mocks.listSends.mockResolvedValue(EMPTY_SENDS);
    mocks.sendIssue.mockResolvedValue({});
  });

  it('sends an approved issue to the active subscribers', async () => {
    renderCard(issue());

    const send = await screen.findByRole('button', {
      name: 'Send to 3 subscribers',
    });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith('Sending started.'),
    );
    expect(mocks.sendIssue).toHaveBeenCalledWith('newsletter-1', {});
  });

  it("saves the access level into this viewer's cached issue only", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(issueKey('user-1', 'org-1'), issue());
    queryClient.setQueryData(issueKey('user-2', 'org-1'), issue());
    mocks.patch.mockResolvedValue(issue({ accessLevel: 'paid' }));
    renderCard(issue(), false, queryClient);

    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Who can read the full issue',
      }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Paid readers' }));

    await waitFor(() =>
      expect(
        queryClient.getQueryData<Newsletter>(issueKey('user-1', 'org-1'))
          ?.accessLevel,
      ).toBe('paid'),
    );
    expect(
      queryClient.getQueryData<Newsletter>(issueKey('user-2', 'org-1'))
        ?.accessLevel,
    ).toBe('public');
  });

  it('follows the access level of a refreshed copy of the issue', async () => {
    const { rerender } = renderCard(issue({ accessLevel: 'public' }));
    await screen.findByRole('button', { name: 'Preview email' });
    expect(
      screen.queryByRole('button', {
        name: 'Preview what non-paying readers get',
      }),
    ).not.toBeInTheDocument();

    rerender(
      <NewsletterSendCard
        isDirty={false}
        newsletter={issue({ accessLevel: 'paid' })}
      />,
    );

    expect(
      await screen.findByRole('button', {
        name: 'Preview what non-paying readers get',
      }),
    ).toBeInTheDocument();
  });

  it.each([
    [{ status: 'draft' }, false, 'Approve the issue before sending.'],
    [{ content: '  ' }, false, 'Add content before sending.'],
    [{}, true, 'Save your changes before sending.'],
  ] as const)(
    'explains why %o cannot be sent yet',
    async (overrides, isDirty, reason) => {
      renderCard(issue(overrides as Partial<Newsletter>), isDirty);

      expect(
        await screen.findByRole('button', { name: 'Send to 3 subscribers' }),
      ).toBeDisabled();
      expect(screen.getByText(reason)).toBeVisible();
    },
  );

  it('shows the progress of a running send with pause and cancel', async () => {
    mocks.listSends.mockResolvedValue({
      ...EMPTY_SENDS,
      items: [
        {
          id: 'send-1',
          newsletterId: 'newsletter-1',
          recipientCount: 3,
          scheduledFor: '2026-11-09T10:00:00.000Z',
          sentCount: 1,
          status: 'sending',
        },
      ],
      total: 1,
    });

    renderCard(issue());

    expect(await screen.findByText('1 of 3 sent')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel send' })).toBeVisible();
  });
});
