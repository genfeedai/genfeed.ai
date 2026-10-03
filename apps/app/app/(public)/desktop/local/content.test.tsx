import type { DesktopRuntimeSnapshot } from '@genfeedai/services/core/desktop-runtime.service';
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

const runtimeMocks = vi.hoisted(() => ({
  snapshot: {
    status: 'ready',
    context: {
      version: 1,
      runtimeId: 'local',
      revision: 0,
      status: 'ready',
      selectedServerId: 'cloud',
      selectedServerKind: 'cloud',
      selectedApiEndpoint: 'https://api.genfeed.ai/v1',
      runtimeMode: 'local',
      generationExecution: 'unknown',
      localProvider: null,
    },
  } as DesktopRuntimeSnapshot,
}));
vi.mock(
  '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context',
  () => ({ useDesktopRuntimeContext: () => runtimeMocks.snapshot }),
);
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
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

const localWorkspaceFlag = vi.hoisted(() => ({
  isAvailable: true,
  isEnabled: true,
  isReady: true,
}));

vi.mock('@/lib/desktop/use-desktop-local-workspace-flag', () => ({
  useDesktopLocalWorkspaceFlag: () => localWorkspaceFlag,
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
    localWorkspaceFlag.isAvailable = true;
    localWorkspaceFlag.isEnabled = true;
    localWorkspaceFlag.isReady = true;
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

  it.each([
    ['local', 'Local generation · no Genfeed credits'],
    ['remote', 'Your provider · no Genfeed credits. Provider fees may apply'],
    ['unknown', 'Provider cost unavailable'],
  ] as const)(
    'labels configured %s transport without claiming provider fees are free',
    async (networkAccess, label) => {
      const context = runtimeMocks.snapshot.context;
      if (!context) throw new Error('Missing runtime fixture');
      runtimeMocks.snapshot = {
        status: 'ready',
        context: {
          ...context,
          generationExecution: 'local-byok',
          localProvider: { provider: 'openai-compatible', networkAccess },
        },
      };
      render(<LocalDesktopContent />);
      await waitFor(() =>
        expect(
          screen.getByTestId('desktop-local-generation-cost'),
        ).toHaveTextContent(label),
      );
    },
  );

  it('shows a starting state until local mode is ready', () => {
    mocks.enableOfflineMode.mockImplementation(
      () => new Promise<typeof bootstrap>(() => undefined),
    );
    render(<LocalDesktopContent />);

    expect(screen.getByText('Starting local workspace…')).toBeVisible();
    expect(screen.queryByText('Local provider settings')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose folder' })).toBeNull();
  });

  it('redirects to sign-in without starting local mode in cloud-only builds', async () => {
    const originalLocation = window.location;
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
      writable: true,
    });
    localWorkspaceFlag.isAvailable = false;
    localWorkspaceFlag.isEnabled = false;
    localWorkspaceFlag.isReady = false;

    try {
      const { container } = render(<LocalDesktopContent />);

      await waitFor(() => {
        expect(assign).toHaveBeenCalledWith('/login');
      });
      expect(container).toBeEmptyDOMElement();
      expect(mocks.enableOfflineMode).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });

  it('activates local mode explicitly and shows the selected workspace', async () => {
    render(<LocalDesktopContent />);

    await waitFor(() => {
      expect(mocks.enableOfflineMode).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('/Users/test/Genfeed')).toBeVisible();
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
