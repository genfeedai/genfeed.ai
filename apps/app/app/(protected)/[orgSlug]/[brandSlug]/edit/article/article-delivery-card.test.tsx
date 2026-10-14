import type { Article } from '@genfeedai/models/content/article.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleDeliveryCard from './article-delivery-card';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const {
  copyToClipboardMock,
  credentialsMock,
  deliverMock,
  findDeliveriesMock,
  openConfirmMock,
} = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(),
  credentialsMock: { current: [] as unknown[] },
  deliverMock: vi.fn(),
  findDeliveriesMock: vi.fn(),
  openConfirmMock: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ credentials: credentialsMock.current }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/studio${path}` }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    deliver: deliverMock,
    findDeliveries: findDeliveriesMock,
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: openConfirmMock }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard: copyToClipboardMock }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

const article = {
  externalUrl: null,
  id: 'article-1',
  label: 'Launch notes',
} as unknown as Article;

function renderCard(overrides: { isDirty?: boolean; content?: string } = {}) {
  const onDelivered = vi.fn();
  const onSaveExternalUrl = vi.fn().mockResolvedValue(undefined);
  render(
    <ArticleDeliveryCard
      article={article}
      content={overrides.content ?? '<p>Body</p>'}
      isDirty={overrides.isDirty ?? false}
      isSavingExternalUrl={false}
      onDelivered={onDelivered}
      onSaveExternalUrl={onSaveExternalUrl}
    />,
  );
  return { onDelivered, onSaveExternalUrl };
}

describe('ArticleDeliveryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    credentialsMock.current = [];
    findDeliveriesMock.mockResolvedValue([]);
    deliverMock.mockResolvedValue({ id: 'release-1' });
  });

  it('offers only connected blog accounts and publishes through the chosen one', async () => {
    credentialsMock.current = [
      {
        id: 'ghost-1',
        isConnected: true,
        label: 'Team blog',
        platform: 'ghost',
      },
      {
        id: 'devto-1',
        isConnected: true,
        label: 'Dev.to author',
        platform: 'devto',
      },
      {
        id: 'beehiiv-1',
        isConnected: true,
        label: 'Weekly',
        platform: 'beehiiv',
      },
      {
        id: 'wp-1',
        isConnected: false,
        label: 'Old site',
        platform: 'wordpress',
      },
    ];
    const { onDelivered } = renderCard();

    expect(
      screen.getByRole('button', { name: 'Publish to Team blog' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Publish to Dev.to author' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Publish to Weekly' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish to Old site' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Publish to Team blog' }),
    );
    const { onConfirm } = openConfirmMock.mock.calls[0][0];
    await onConfirm();

    expect(deliverMock).toHaveBeenCalledWith('article-1', {
      credentialId: 'ghost-1',
    });
    expect(onDelivered).toHaveBeenCalled();
    await waitFor(() => expect(findDeliveriesMock).toHaveBeenCalledTimes(2));
  });

  it('blocks publishing unsaved changes', () => {
    credentialsMock.current = [
      {
        id: 'ghost-1',
        isConnected: true,
        label: 'Team blog',
        platform: 'ghost',
      },
    ];
    renderCard({ isDirty: true });

    expect(
      screen.getByRole('button', { name: 'Publish to Team blog' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Save your changes before you publish.'),
    ).toBeInTheDocument();
  });

  it('keeps workspace-only publishing with copy-out when no blog is connected', () => {
    renderCard();

    expect(
      screen.getByText(
        /No Ghost, WordPress, Medium or Dev.to account is connected/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Connect an account' }),
    ).toHaveAttribute('href', '/acme/studio/settings/connected-accounts');

    fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));
    expect(copyToClipboardMock).toHaveBeenCalledWith('<p>Body</p>');
  });

  it('lists deliveries with their live links', async () => {
    credentialsMock.current = [
      {
        id: 'ghost-1',
        isConnected: true,
        label: 'Team blog',
        platform: 'ghost',
      },
    ];
    findDeliveriesMock.mockResolvedValue([
      {
        credentialId: 'ghost-1',
        executionState: 'published',
        id: 'target-1',
        platform: 'ghost',
        url: 'https://blog.example.com/launch-notes',
      },
    ]);
    renderCard();

    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://blog.example.com/launch-notes',
    );
  });

  it('records an external live link and rejects a non-web URL', () => {
    const { onSaveExternalUrl } = renderCard();
    const input = screen.getByLabelText('Published somewhere else?');

    fireEvent.change(input, { target: { value: 'not a link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(
      screen.getByText('Enter a full http or https link.'),
    ).toBeInTheDocument();
    expect(onSaveExternalUrl).not.toHaveBeenCalled();

    fireEvent.change(input, {
      target: { value: 'https://dev.to/acme/launch-notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(onSaveExternalUrl).toHaveBeenCalledWith(
      'https://dev.to/acme/launch-notes',
    );
  });
});
