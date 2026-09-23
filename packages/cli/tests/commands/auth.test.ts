import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFileSystem: { content: string | null } = { content: null };
const printed: string[] = [];

const { mockValidateApiKey } = vi.hoisted(() => ({
  mockValidateApiKey: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  chmod: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => {
    if (mockFileSystem.content === null) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return mockFileSystem.content;
  }),
  writeFile: vi.fn(async (_path: string, data: string) => {
    mockFileSystem.content = data;
  }),
}));

vi.mock('../../src/api/auth', () => ({
  validateApiKey: () => mockValidateApiKey(),
}));

vi.mock('../../src/ui/theme', () => ({
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: (message = '') => {
    printed.push(message);
  },
}));

function makeConfigJson(profileOverrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    activeProfile: 'default',
    profiles: {
      default: {
        apiUrl: 'https://api.genfeed.ai/v1',
        defaults: { imageModel: 'imagen-4', videoModel: 'google-veo-3' },
        role: 'user',
        ...profileOverrides,
      },
    },
  });
}

describe('auth status and logout', () => {
  beforeEach(async () => {
    mockFileSystem.content = null;
    printed.length = 0;
    mockValidateApiKey.mockReset();
    delete process.env.GENFEED_API_KEY;
    delete process.env.GENFEED_ORGANIZATION_ID;
    const { clearConfigCache } = await import('../../src/config/store');
    clearConfigCache();
  });

  it('prints logged-in, organization, and scopes when a key and org are stored', async () => {
    mockFileSystem.content = makeConfigJson({
      apiKey: 'gf_test_key',
      organizationId: 'org-1',
    });
    mockValidateApiKey.mockResolvedValue({
      organization: { id: 'org-1', name: 'Org' },
      scopes: ['mcp', 'read'],
      user: { email: 'user@example.com', id: 'user-1', name: 'User' },
    });

    const { clearConfigCache } = await import('../../src/config/store');
    clearConfigCache();
    const { authCommand } = await import('../../src/commands/auth');

    await authCommand.parseAsync(['status'], { from: 'user' });

    expect(printed).toEqual(['Logged in: yes\nOrganization: org-1\nScopes: mcp, read']);
    expect(mockValidateApiKey).toHaveBeenCalledOnce();
  });

  it('clears the stored API key on auth logout and top-level logout', async () => {
    mockFileSystem.content = makeConfigJson({
      activeBrand: 'brand-1',
      apiKey: 'gf_test_key',
      organizationId: 'org-1',
    });

    const store = await import('../../src/config/store');
    store.clearConfigCache();
    const { authCommand } = await import('../../src/commands/auth');
    const { logoutCommand } = await import('../../src/commands/logout');

    await authCommand.parseAsync(['logout'], { from: 'user' });
    store.clearConfigCache();
    expect(await store.getApiKey()).toBeUndefined();
    expect(mockFileSystem.content).not.toContain('gf_test_key');

    mockFileSystem.content = makeConfigJson({ apiKey: 'gf_test_again' });
    store.clearConfigCache();
    await logoutCommand.parseAsync([], { from: 'user' });
    store.clearConfigCache();
    expect(await store.getApiKey()).toBeUndefined();
    expect(mockFileSystem.content).not.toContain('gf_test_again');
  });
});
