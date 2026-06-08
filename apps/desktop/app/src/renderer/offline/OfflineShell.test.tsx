import type { IDesktopBootstrap } from '@genfeedai/desktop-contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OfflineShell from './OfflineShell';

const bootstrap: IDesktopBootstrap = {
  activeWorkspaceId: 'workspace-1',
  brands: [],
  clerkId: null,
  environment: {
    apiEndpoint: '',
    appEndpoint: '',
    appName: 'desktop',
    appPort: 3230,
    authEndpoint: '',
    cdnUrl: '',
    wsEndpoint: '',
  },
  isOfflineMode: true,
  localOrganization: {
    id: 'local-org',
    name: 'Local Workspace',
    slug: 'local-workspace',
  },
  localUser: {
    id: 'local-user',
    name: 'Local Desktop User',
    organizationId: 'local-org',
  },
  localUserId: 'local-user',
  preferences: { nativeNotificationsEnabled: false },
  recents: [],
  session: null,
  syncState: {
    failedCount: 0,
    pendingCount: 0,
    retryingCount: 0,
    runningCount: 0,
  },
  workspaces: [
    {
      createdAt: '2026-04-01T09:00:00.000Z',
      fileIndex: [],
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: '2026-04-01T09:00:00.000Z',
      localDraftCount: 0,
      name: 'Workspace One',
      path: '/tmp/workspace-one',
      pendingSyncCount: 0,
      syncPolicy: 'local-only',
      updatedAt: '2026-04-01T09:00:00.000Z',
    },
  ],
};

describe('OfflineShell', () => {
  it('renders without a session and shows the local workspace list', async () => {
    window.genfeedDesktop = {
      app: {
        enableOfflineMode: vi.fn(),
        getBootstrap: vi.fn(),
        getDiagnostics: vi.fn(),
        onDidBootstrapChange: vi.fn(),
        onToggleSidebar: vi.fn(),
        openExternalPath: vi.fn(),
      },
      auth: {} as never,
      cache: {} as never,
      cloud: {
        generateContent: vi.fn(),
        generateHooks: vi.fn(),
        getAnalytics: vi.fn(),
        getIngredients: vi.fn(),
        getTrends: vi.fn(),
        listAgents: vi.fn(),
        listProjects: vi.fn().mockResolvedValue({
          data: [{ id: 'project-1', name: 'Local Project', status: 'local' }],
          status: 'success',
        }),
        listWorkflows: vi.fn(),
        publishPost: vi.fn(),
        runAgent: vi.fn(),
        runWorkflow: vi.fn(),
      },
      drafts: {} as never,
      files: {} as never,
      generation: {} as never,
      notifications: {} as never,
      onboarding: {} as never,
      onQuickGenerate: vi.fn(),
      platform: 'darwin',
      sync: {} as never,
      terminal: {} as never,
      workspace: {} as never,
    };

    render(<OfflineShell bootstrap={bootstrap} />);

    expect(screen.getByTestId('offline-shell')).toBeInTheDocument();
    expect(screen.getByText('Local Desktop User')).toBeInTheDocument();
    expect(screen.getByTestId('offline-workspaces')).toHaveTextContent(
      'Workspace One',
    );

    await waitFor(() =>
      expect(screen.getByTestId('offline-projects')).toHaveTextContent(
        'Local Project',
      ),
    );
  });

  it('shows queued offline status for cloud-dependent actions', async () => {
    window.genfeedDesktop = {
      app: {
        enableOfflineMode: vi.fn(),
        getBootstrap: vi.fn(),
        getDiagnostics: vi.fn(),
        onDidBootstrapChange: vi.fn(),
        onToggleSidebar: vi.fn(),
        openExternalPath: vi.fn(),
      },
      auth: {} as never,
      cache: {} as never,
      cloud: {
        generateContent: vi.fn(),
        generateHooks: vi.fn().mockResolvedValue({
          message: 'Queued for sync - will complete when you sign in',
          status: 'queued_offline',
          syncJobId: 'job-1',
        }),
        getAnalytics: vi.fn(),
        getIngredients: vi.fn(),
        getTrends: vi.fn(),
        listAgents: vi.fn(),
        listProjects: vi.fn().mockResolvedValue({
          data: [],
          status: 'success',
        }),
        listWorkflows: vi.fn(),
        publishPost: vi.fn().mockResolvedValue({
          message: 'Queued for sync - will complete when you sign in',
          status: 'queued_offline',
          syncJobId: 'job-2',
        }),
        runAgent: vi.fn(),
        runWorkflow: vi.fn(),
      },
      drafts: {} as never,
      files: {} as never,
      generation: {} as never,
      notifications: {} as never,
      onboarding: {} as never,
      onQuickGenerate: vi.fn(),
      platform: 'darwin',
      sync: {} as never,
      terminal: {} as never,
      workspace: {} as never,
    };

    render(<OfflineShell bootstrap={bootstrap} />);

    expect(screen.getAllByText('Sign in to enable')).toHaveLength(2);

    fireEvent.click(screen.getByText('Generate Hooks'));

    await waitFor(() =>
      expect(
        screen.getByText('Queued - will sync when you sign in'),
      ).toBeInTheDocument(),
    );
  });
});
