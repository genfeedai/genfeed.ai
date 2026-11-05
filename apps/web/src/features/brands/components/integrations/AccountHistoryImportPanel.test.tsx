import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  CredentialPlatform,
  SocialSourceHistoryImportStatus,
} from '@genfeedai/contracts';
import type { QueryClient } from '@tanstack/react-query';
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountHistoryImportPanel from '@/features/brands/components/integrations/AccountHistoryImportPanel';

const listOwnAccountSources = vi.fn();
const scheduleHistoryImport = vi.fn();
const socialSourcesService = { listOwnAccountSources, scheduleHistoryImport };

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => socialSourcesService,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function render(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
) {
  return rtlRender(ui, { wrapper: queryClientWrapper(client) });
}

const connection = {
  credentialId: 'credential-1',
  isConnected: true,
  name: 'Genfeed',
  platform: CredentialPlatform.TWITTER,
};

describe('AccountHistoryImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleHistoryImport.mockResolvedValue({
      sourceId: 'source-1',
      status: 'scheduled',
    });
  });

  it("shows this account's last import, not another account's", async () => {
    listOwnAccountSources.mockResolvedValue([
      {
        credentialId: 'credential-2',
        id: 'source-2',
        metadata: {
          historyImport: { status: SocialSourceHistoryImportStatus.FAILED },
        },
      },
      {
        credentialId: 'credential-1',
        id: 'source-1',
        metadata: {
          historyImport: {
            completedAt: '2026-09-26T04:21:19.000Z',
            importedCount: 100,
            status: SocialSourceHistoryImportStatus.COMPLETED,
            windowDays: 90,
          },
        },
      },
    ]);

    render(
      <AccountHistoryImportPanel brandId="brand-1" connection={connection} />,
    );

    expect(await screen.findByText('Imported')).toBeInTheDocument();
    expect(screen.getByText(/Imported 100 posts/)).toBeInTheDocument();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  it('imports an account that skipped the import at connect', async () => {
    listOwnAccountSources.mockResolvedValue([]);

    render(
      <AccountHistoryImportPanel brandId="brand-1" connection={connection} />,
    );

    expect(
      await screen.findByText(
        'Nothing has been imported from this account yet.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import now' }));

    await waitFor(() => {
      expect(scheduleHistoryImport).toHaveBeenCalledWith(
        'credential-1',
        'brand-1',
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Import queued.',
    );
  });

  it('paints the cached last import at once when the panel opens again', async () => {
    listOwnAccountSources.mockResolvedValue([
      {
        credentialId: 'credential-1',
        id: 'source-1',
        metadata: {
          historyImport: {
            completedAt: '2026-09-26T04:21:19.000Z',
            importedCount: 100,
            status: SocialSourceHistoryImportStatus.COMPLETED,
            windowDays: 90,
          },
        },
      },
    ]);
    const client = createTestQueryClient();
    const { unmount } = render(
      <AccountHistoryImportPanel brandId="brand-1" connection={connection} />,
      client,
    );
    expect(await screen.findByText(/Imported 100 posts/)).toBeInTheDocument();
    unmount();

    listOwnAccountSources.mockReturnValue(new Promise(() => undefined));
    render(
      <AccountHistoryImportPanel brandId="brand-1" connection={connection} />,
      client,
    );

    expect(screen.queryByText('Loading connected accounts…')).toBeNull();
    expect(screen.getByText(/Imported 100 posts/)).toBeInTheDocument();
  });
});
