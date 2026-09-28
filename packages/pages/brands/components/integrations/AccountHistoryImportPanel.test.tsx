import {
  CredentialPlatform,
  SocialSourceHistoryImportStatus,
} from '@genfeedai/contracts';
import AccountHistoryImportPanel from '@pages/brands/components/integrations/AccountHistoryImportPanel';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listOwnAccountSources = vi.fn();
const scheduleHistoryImport = vi.fn();
const socialSourcesService = { listOwnAccountSources, scheduleHistoryImport };

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => socialSourcesService,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

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
});
