import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/chrome-extension', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    getToken: vi.fn(),
    isLoaded: true,
    isSignedIn: false,
  }),
}));

vi.mock('~services/auth.service', () => ({
  authService: { getToken: vi.fn().mockResolvedValue(null) },
  getJWTToken: vi.fn(),
}));

vi.mock('~components/chat/ChatContainer', () => ({
  ChatContainer: () => null,
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
vi.mock('~components/ui', () => ({
  LoadingSpinner: () => null,
}));
vi.mock('~store/use-settings-store', () => ({
  useSettingsStore: () => ({}),
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));
describe('SidePanel', () => {
  it('uses ThreadList for the history tab', () => {
    const sidepanelPath = path.resolve(__dirname, '../src/sidepanel.tsx');
    const source = readFileSync(sidepanelPath, 'utf8');

    expect(source).toContain(
      "import { ThreadList } from '~components/history/ThreadList';",
    );
    expect(source).toContain(
      "return <ThreadList onOpenThread={() => setActiveTab('chat')} />;",
    );
  });
});
