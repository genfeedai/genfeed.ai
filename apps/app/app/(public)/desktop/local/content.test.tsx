import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

vi.mock('@/lib/desktop/use-desktop-local-workspace-flag', () => ({
  useDesktopLocalWorkspaceFlag: () => ({ isEnabled: true, isReady: true }),
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
    expect(screen.queryByText('Local provider settings')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry local mode/i }));

    await waitFor(() => {
      expect(mocks.enableOfflineMode).toHaveBeenCalledTimes(2);
    });
  });

  it('aborts local initialization when the component unmounts', async () => {
    let resolveBootstrap: ((value: typeof bootstrap) => void) | undefined;
    mocks.enableOfflineMode.mockImplementationOnce(
      () =>
        new Promise<typeof bootstrap>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { unmount } = render(<LocalDesktopContent />);

    unmount();

    expect(abortSpy).toHaveBeenCalledOnce();
    await act(async () => {
      resolveBootstrap?.(bootstrap);
      await Promise.resolve();
    });
    abortSpy.mockRestore();
  });

  it('shows cloud switching failures', async () => {
    mocks.switchToCloudMode.mockRejectedValueOnce(
      new Error('Cloud mode could not start'),
    );
    render(<LocalDesktopContent />);
    await screen.findByText('/Users/test/Genfeed');

    fireEvent.click(screen.getByRole('button', { name: 'Use Genfeed Cloud' }));

    expect(await screen.findByText('Cloud mode could not start')).toBeVisible();
  });

  it('shows log reveal failures', async () => {
    mocks.enableOfflineMode.mockRejectedValueOnce(
      new Error('Local mode could not start'),
    );
    mocks.revealLogs.mockRejectedValueOnce(new Error('Logs could not open'));
    render(<LocalDesktopContent />);
    await screen.findByText('Local mode could not start');

    fireEvent.click(screen.getByRole('button', { name: 'Reveal logs' }));

    expect(await screen.findByText('Logs could not open')).toBeVisible();
  });
});
