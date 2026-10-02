import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
    isLoaded: true,
    isSignedIn: false,
  }),
}));

const auth = vi.hoisted(() => ({ getToken: vi.fn(), getAuthContext: vi.fn() }));
vi.mock('~services/auth.service', () => ({
  authService: auth,
  getJWTToken: vi.fn(),
}));

vi.mock('~components/chat/ChatContainer', () => ({
  ChatContainer: () => <div>Composer ready</div>,
}));
vi.mock('~components/create/CreatePanel', () => ({
  CreatePanel: () => null,
}));
vi.mock('~components/history/ThreadList', () => ({
  ThreadList: () => null,
}));
vi.mock('~components/navigation/SidebarNav', () => ({
  SidebarNav: () => null,
}));
vi.mock('~components/settings/SettingsPanel', () => ({
  SettingsPanel: () => null,
}));
vi.mock('~store/use-settings-store', () => ({
  useSettingsStore: () => ({}),
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('~hooks/use-extension-theme', () => ({
  useExtensionTheme: () => true,
}));
vi.mock('~hooks/use-account-theme-sync', () => ({
  useAccountThemeSync: vi.fn(),
}));
vi.mock('~components/settings/BrandSelector', () => ({
  BrandSelector: () => null,
}));
vi.mock('~components/pages/IdeaDraftPage', () => ({
  IdeaDraftPage: () => null,
}));
vi.mock('~components/pages/KnowledgeCapturePage', () => ({
  KnowledgeCapturePage: () => null,
}));
vi.mock('~services/error-tracking.service', () => ({
  initializeErrorTracking: vi.fn(),
}));
vi.mock('~store/use-chat-store', () => ({ useChatStore: () => false }));
vi.mock('~style.css', () => ({}));
import SidePanel from '../src/sidepanel';

beforeEach(() => {
  vi.clearAllMocks();
  auth.getToken.mockResolvedValue('existing-token');
  auth.getAuthContext.mockReset();
});

describe('SidePanel', () => {
  it('validates the stored credential against the API even if the React session is unavailable', async () => {
    auth.getAuthContext.mockResolvedValue({ organization: { id: 'org-1' } });
    render(<SidePanel />);
    expect(await screen.findByText('Composer ready')).toBeInTheDocument();
    expect(auth.getAuthContext).toHaveBeenCalledWith(true);
  });

  it('shows the actual API failure and retries without reopening or clearing the credential', async () => {
    auth.getAuthContext
      .mockRejectedValueOnce(
        new Error(
          'Could not load your Genfeed workspace (HTTP 503). Retry in a moment.',
        ),
      )
      .mockResolvedValueOnce({ organization: { id: 'org-1' } });
    render(<SidePanel />);
    expect(await screen.findByText(/HTTP 503/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Complete account setup/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Composer ready')).toBeInTheDocument();
    expect(auth.getAuthContext).toHaveBeenCalledTimes(2);
  });

  it('opens the configured web app from the blocked panel', async () => {
    auth.getAuthContext.mockRejectedValue(
      new Error(
        'Your session is valid, but Genfeed did not return an active workspace.',
      ),
    );
    vi.mocked(chrome.tabs.create).mockResolvedValue({} as never);
    render(<SidePanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Genfeed' }),
    );
    await waitFor(() =>
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringMatching(/^https:\/\/app\.genfeed\.(ai|localhost)/),
      }),
    );
  });

  it('handles a network failure without an unhandled rejection or a false onboarding claim', async () => {
    auth.getAuthContext.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<SidePanel />);
    expect(await screen.findByText(/Could not connect/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Complete account setup/),
    ).not.toBeInTheDocument();
  });

  it('uses ThreadList for the history tab', () => {
    const sidepanelPath = path.resolve(testDir, '../src/sidepanel.tsx');
    const source = readFileSync(sidepanelPath, 'utf8');

    expect(source).toContain(
      "import { ThreadList } from '~components/history/ThreadList';",
    );
    expect(source).toContain(
      "return <ThreadList onOpenThread={() => onActiveTabChange('chat')} />;",
    );
  });

  it('uses the shared extension theme adapter instead of forcing dark mode', () => {
    const sidepanelPath = path.resolve(testDir, '../src/sidepanel.tsx');
    const source = readFileSync(sidepanelPath, 'utf8');

    expect(source).toContain(
      "import { useExtensionTheme } from '~hooks/use-extension-theme';",
    );
    expect(source).toContain('useExtensionTheme();');
    expect(source).not.toContain("setAttribute('data-theme', 'dark')");
  });

  it('keeps Add to Knowledge off the import route', () => {
    const sidepanelPath = path.resolve(testDir, '../src/sidepanel.tsx');
    const source = readFileSync(sidepanelPath, 'utf8');

    expect(source).toContain('KnowledgeCapturePage');
    expect(source).toContain("type: 'addToKnowledge'");
    expect(source).not.toContain('captureSave');
    expect(source).not.toContain("event: 'savePost'");
  });
});
