import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('shows local workspace as coming soon and does not start PGlite', () => {
    render(<LocalDesktopContent />);

    expect(
      screen.getByRole('heading', {
        name: 'Local workspace is not available yet',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Sign in to Genfeed Cloud. On-device PGlite workspace and local generation are disabled for now.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Choose folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    expect(mocks.enableOfflineMode).not.toHaveBeenCalled();
    expect(mocks.openWorkspace).not.toHaveBeenCalled();
  });

  it('keeps a cloud-mode escape hatch on the coming-soon surface', async () => {
    mocks.switchToCloudMode.mockRejectedValueOnce(
      new Error('Cloud mode could not start'),
    );
    render(<LocalDesktopContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Use Genfeed Cloud' }));

    expect(await screen.findByText('Cloud mode could not start')).toBeVisible();
  });

  it('aborts the unused local initializer when the component unmounts', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { unmount } = render(<LocalDesktopContent />);

    unmount();

    expect(abortSpy).toHaveBeenCalledOnce();
    abortSpy.mockRestore();
  });
});
