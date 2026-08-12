import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocalDesktopContent from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.desktop.local');

  return { useTranslations: () => translate };
});

const mocks = vi.hoisted(() => ({
  enableOfflineMode: vi.fn(),
  generateContent: vi.fn(),
  getBootstrap: vi.fn(),
  getDesktopBridge: vi.fn(),
  openWorkspace: vi.fn(),
  revealLogs: vi.fn(),
  selectWorkspace: vi.fn(),
  switchToCloudMode: vi.fn(),
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}));

vi.mock('@/components/desktop/DesktopLocalProviderSettings', () => ({
  default: () => <div>Local provider settings</div>,
}));

const bootstrap = {
  activeWorkspaceId: 'workspace-1',
  isOfflineMode: true,
  workspaces: [
    {
      createdAt: '2026-08-12T00:00:00.000Z',
      fileIndex: [],
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: '2026-08-12T00:00:00.000Z',
      localDraftCount: 0,
      name: 'Local workspace',
      path: '/Users/test/Genfeed',
      pendingSyncCount: 0,
      syncPolicy: 'local-only',
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ],
};

describe('LocalDesktopContent', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.enableOfflineMode.mockResolvedValue(bootstrap);
    mocks.getBootstrap.mockResolvedValue(bootstrap);
    mocks.generateContent.mockResolvedValue({
      content: 'Generated locally',
      id: 'generated-1',
      platform: 'twitter',
      type: 'caption',
    });
    mocks.getDesktopBridge.mockReturnValue({
      app: {
        enableOfflineMode: mocks.enableOfflineMode,
        getBootstrap: mocks.getBootstrap,
        revealLogs: mocks.revealLogs,
        switchToCloudMode: mocks.switchToCloudMode,
      },
      cloud: { generateContent: mocks.generateContent },
      workspace: {
        openWorkspace: mocks.openWorkspace,
        selectWorkspace: mocks.selectWorkspace,
      },
    });
  });

  it('activates local mode explicitly and shows the selected workspace', async () => {
    render(<LocalDesktopContent />);

    await waitFor(() => {
      expect(mocks.enableOfflineMode).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('/Users/test/Genfeed')).toBeVisible();
    expect(screen.getByText('Local provider settings')).toBeVisible();
  });

  it('generates content through the local desktop data service', async () => {
    render(<LocalDesktopContent />);
    await screen.findByText('/Users/test/Genfeed');

    fireEvent.change(
      screen.getByRole('textbox', { name: /local generation/i }),
      {
        target: { value: 'Write a launch post' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(mocks.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Write a launch post',
          type: 'caption',
        }),
      );
    });
    expect(await screen.findByText('Generated locally')).toBeVisible();
  });

  it('keeps local initialization failures recoverable', async () => {
    mocks.enableOfflineMode.mockRejectedValueOnce(
      new Error('Legacy database could not be repaired'),
    );
    render(<LocalDesktopContent />);

    expect(
      await screen.findByText('Legacy database could not be repaired'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /retry local mode/i }));

    await waitFor(() => {
      expect(mocks.enableOfflineMode).toHaveBeenCalledTimes(2);
    });
  });
});
