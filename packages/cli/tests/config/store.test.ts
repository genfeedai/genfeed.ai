import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFileSystem: { content: string | null } = { content: null };

vi.mock('node:fs/promises', () => ({
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

describe('config/store', () => {
  beforeEach(async () => {
    mockFileSystem.content = null;
    const { clearConfigCache } = await import('../../src/config/store');
    clearConfigCache();
    delete process.env.GENFEED_API_KEY;
    delete process.env.GENFEED_API_URL;
    delete process.env.GENFEED_APP_URL;
    delete process.env.GENFEED_TOKEN;
    delete process.env.GENFEED_ORGANIZATION_ID;
    delete process.env.GENFEED_USER_ID;
    delete process.env.GENFEED_AGENT_MODEL;
  });

  describe('getApiKey', () => {
    it('returns undefined when no API key is set', async () => {
      const { getApiKey } = await import('../../src/config/store');
      expect(await getApiKey()).toBeUndefined();
    });

    it('returns API key when set', async () => {
      mockFileSystem.content = makeConfigJson({ apiKey: 'test-api-key' });
      const { getApiKey } = await import('../../src/config/store');
      expect(await getApiKey()).toBe('test-api-key');
    });
  });

  describe('setApiKey', () => {
    it('stores the API key', async () => {
      const { setApiKey, getApiKey } = await import('../../src/config/store');
      await setApiKey('new-api-key');
      expect(await getApiKey()).toBe('new-api-key');
    });
  });

  describe('clearApiKey', () => {
    it('removes the API key', async () => {
      mockFileSystem.content = makeConfigJson({ apiKey: 'test-api-key' });
      const { clearApiKey, getApiKey } = await import('../../src/config/store');
      await clearApiKey();
      expect(await getApiKey()).toBeUndefined();
    });
  });

  describe('getApiUrl', () => {
    it('returns default API URL when not set', async () => {
      const { getApiUrl } = await import('../../src/config/store');
      expect(await getApiUrl()).toBe('https://api.genfeed.ai/v1');
    });

    it('returns custom API URL when set', async () => {
      mockFileSystem.content = makeConfigJson({ apiUrl: 'https://custom.api.com/v1' });
      const { getApiUrl } = await import('../../src/config/store');
      expect(await getApiUrl()).toBe('https://custom.api.com/v1');
    });
  });

  describe('setProfileField', () => {
    it('stores the API URL', async () => {
      const { setProfileField, getApiUrl } = await import('../../src/config/store');
      await setProfileField('apiUrl', 'https://new.api.com/v1');
      expect(await getApiUrl()).toBe('https://new.api.com/v1');
    });
  });

  describe('getAppUrl', () => {
    it('derives the SaaS app URL from the default API URL', async () => {
      const { getAppUrl } = await import('../../src/config/store');
      expect(await getAppUrl()).toBe('https://app.genfeed.ai');
    });

    it('derives a self-hosted app URL from the configured API URL', async () => {
      mockFileSystem.content = makeConfigJson({ apiUrl: 'https://api.selfhost.dev/v1' });
      const { getAppUrl } = await import('../../src/config/store');
      expect(await getAppUrl()).toBe('https://app.selfhost.dev');
    });

    it('prefers an explicitly configured app URL', async () => {
      mockFileSystem.content = makeConfigJson({
        apiUrl: 'https://api.selfhost.dev/v1',
        appUrl: 'https://studio.selfhost.dev',
      });
      const { getAppUrl } = await import('../../src/config/store');
      expect(await getAppUrl()).toBe('https://studio.selfhost.dev');
    });
  });

  describe('getLoginEndpoints', () => {
    it('returns the API, app, and auth URLs for the active profile', async () => {
      mockFileSystem.content = makeConfigJson({ apiUrl: 'https://api.selfhost.dev/v1' });
      const { getLoginEndpoints } = await import('../../src/config/store');
      expect(await getLoginEndpoints()).toEqual({
        apiBaseUrl: 'https://api.selfhost.dev/v1',
        appUrl: 'https://app.selfhost.dev',
        authUrl: 'https://app.selfhost.dev/oauth/cli',
      });
    });
  });

  describe('getActiveBrand', () => {
    it('returns undefined when no brand is set', async () => {
      const { getActiveBrand } = await import('../../src/config/store');
      expect(await getActiveBrand()).toBeUndefined();
    });

    it('returns brand ID when set', async () => {
      mockFileSystem.content = makeConfigJson({ activeBrand: 'brand-123' });
      const { getActiveBrand } = await import('../../src/config/store');
      expect(await getActiveBrand()).toBe('brand-123');
    });
  });

  describe('setActiveBrand', () => {
    it('stores the active brand', async () => {
      const { setActiveBrand, getActiveBrand } = await import('../../src/config/store');
      await setActiveBrand('brand-456');
      expect(await getActiveBrand()).toBe('brand-456');
    });
  });

  describe('clearActiveBrand', () => {
    it('removes the active brand', async () => {
      mockFileSystem.content = makeConfigJson({ activeBrand: 'brand-123' });
      const { clearActiveBrand, getActiveBrand } = await import('../../src/config/store');
      await clearActiveBrand();
      expect(await getActiveBrand()).toBeUndefined();
    });
  });

  describe('getActiveProfile defaults', () => {
    it('returns default agent model as undefined', async () => {
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.agent.model).toBeUndefined();
    });

    it('returns default image model', async () => {
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.defaults.imageModel).toBe('imagen-4');
    });

    it('returns custom image model when set', async () => {
      mockFileSystem.content = makeConfigJson({
        defaults: { imageModel: 'custom-model', videoModel: 'google-veo-3' },
      });
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.defaults.imageModel).toBe('custom-model');
    });

    it('returns default video model', async () => {
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.defaults.videoModel).toBe('google-veo-3');
    });

    it('returns custom video model when set', async () => {
      mockFileSystem.content = makeConfigJson({
        defaults: { imageModel: 'imagen-4', videoModel: 'custom-video' },
      });
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.defaults.videoModel).toBe('custom-video');
    });
  });

  describe('clearConfigCache', () => {
    it('forces reload from file on next access', async () => {
      const { getApiKey, clearConfigCache } = await import('../../src/config/store');
      // First load uses default (no file)
      expect(await getApiKey()).toBeUndefined();
      // Write a config file
      mockFileSystem.content = makeConfigJson({ apiKey: 'from-file' });
      clearConfigCache();
      expect(await getApiKey()).toBe('from-file');
    });
  });

  describe('getConfigPath', () => {
    it('returns config file path', async () => {
      const { getConfigPath } = await import('../../src/config/store');
      expect(getConfigPath()).toContain('.gf');
      expect(getConfigPath()).toContain('config.json');
    });
  });

  describe('getConfigDir', () => {
    it('returns the config directory', async () => {
      const { getConfigDir } = await import('../../src/config/store');
      expect(getConfigDir()).toContain('.gf');
      expect(getConfigDir()).not.toContain('config.json');
    });
  });

  describe('resolveProfile', () => {
    it('throws for an unknown profile name', async () => {
      const { loadConfig, resolveProfile } = await import('../../src/config/store');
      const config = await loadConfig();
      expect(() => resolveProfile(config, 'missing')).toThrow(
        'Profile "missing" does not exist. Run `gf profile list` to see available profiles.'
      );
    });
  });

  describe('getRole and setRole', () => {
    it('returns the default role', async () => {
      const { getRole } = await import('../../src/config/store');
      expect(await getRole()).toBe('user');
    });

    it('stores an admin role', async () => {
      const { getRole, setRole } = await import('../../src/config/store');
      await setRole('admin');
      expect(await getRole()).toBe('admin');
    });
  });

  describe('organization id', () => {
    it('returns undefined when no organization is set', async () => {
      const { getOrganizationId } = await import('../../src/config/store');
      expect(await getOrganizationId()).toBeUndefined();
    });

    it('stores and returns the organization id', async () => {
      const { getOrganizationId, setOrganizationId } = await import('../../src/config/store');
      await setOrganizationId('org-42');
      expect(await getOrganizationId()).toBe('org-42');
    });

    it('prefers the GENFEED_ORGANIZATION_ID env override', async () => {
      mockFileSystem.content = makeConfigJson({ organizationId: 'org-file' });
      process.env.GENFEED_ORGANIZATION_ID = 'org-env';
      const { getOrganizationId } = await import('../../src/config/store');
      expect(await getOrganizationId()).toBe('org-env');
    });
  });

  describe('token and user overrides', () => {
    it('applies GENFEED_TOKEN and GENFEED_USER_ID env overrides', async () => {
      process.env.GENFEED_TOKEN = 'token-env';
      process.env.GENFEED_USER_ID = 'user-env';
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.token).toBe('token-env');
      expect(profile.userId).toBe('user-env');
    });
  });

  describe('profile management', () => {
    it('creates a new profile with defaults', async () => {
      const { createProfile, listProfiles } = await import('../../src/config/store');
      await createProfile('staging');
      const profiles = await listProfiles();
      const staging = profiles.find((entry) => entry.name === 'staging');
      expect(staging).toBeDefined();
      expect(staging?.active).toBe(false);
      expect(staging?.profile.apiUrl).toBeDefined();
    });

    it('creates a profile with overrides and drops undefined values', async () => {
      const { createProfile, listProfiles } = await import('../../src/config/store');
      await createProfile('staging', { apiKey: undefined, apiUrl: 'https://staging.api.dev/v1' });
      const profiles = await listProfiles();
      const staging = profiles.find((entry) => entry.name === 'staging');
      expect(staging?.profile.apiUrl).toBe('https://staging.api.dev/v1');
      expect(staging?.profile.apiKey).toBeUndefined();
    });

    it('rejects creating a duplicate profile', async () => {
      const { createProfile } = await import('../../src/config/store');
      await expect(createProfile('default')).rejects.toThrow('Profile "default" already exists.');
    });

    it('switches the active profile', async () => {
      const { createProfile, listProfiles, setActiveProfileName } = await import(
        '../../src/config/store'
      );
      await createProfile('staging');
      await setActiveProfileName('staging');
      const profiles = await listProfiles();
      expect(profiles.find((entry) => entry.name === 'staging')?.active).toBe(true);
      expect(profiles.find((entry) => entry.name === 'default')?.active).toBe(false);
    });

    it('rejects switching to an unknown profile', async () => {
      const { setActiveProfileName } = await import('../../src/config/store');
      await expect(setActiveProfileName('missing')).rejects.toThrow(
        'Profile "missing" does not exist.'
      );
    });
  });

  describe('loadConfig', () => {
    it('returns full config object', async () => {
      mockFileSystem.content = makeConfigJson({ activeBrand: 'brand-123', apiKey: 'test-key' });
      const { loadConfig } = await import('../../src/config/store');
      const config = await loadConfig();
      expect(config.activeProfile).toBe('default');
      expect(config.profiles.default.apiKey).toBe('test-key');
      expect(config.profiles.default.activeBrand).toBe('brand-123');
      expect(config.profiles.default.apiUrl).toBe('https://api.genfeed.ai/v1');
    });
  });

  describe('runtime overrides', () => {
    it('env var overrides config API key', async () => {
      mockFileSystem.content = makeConfigJson({ apiKey: 'from-file' });
      process.env.GENFEED_API_KEY = 'from-env';
      const { getApiKey } = await import('../../src/config/store');
      expect(await getApiKey()).toBe('from-env');
    });

    it('env var overrides config API URL', async () => {
      process.env.GENFEED_API_URL = 'https://env.api.com/v1';
      const { getApiUrl } = await import('../../src/config/store');
      expect(await getApiUrl()).toBe('https://env.api.com/v1');
    });

    it('env var overrides the configured app URL', async () => {
      mockFileSystem.content = makeConfigJson({ appUrl: 'https://studio.selfhost.dev' });
      process.env.GENFEED_APP_URL = 'https://env.selfhost.dev';
      const { getAppUrl } = await import('../../src/config/store');
      expect(await getAppUrl()).toBe('https://env.selfhost.dev');
    });

    it('derives the app URL from an env-provided API URL', async () => {
      process.env.GENFEED_API_URL = 'https://api.env-host.dev/v1';
      const { getAppUrl } = await import('../../src/config/store');
      expect(await getAppUrl()).toBe('https://app.env-host.dev');
    });

    it('env var overrides the configured agent model', async () => {
      mockFileSystem.content = makeConfigJson({
        agent: { lastThreadIdByOrganization: {}, model: 'gpt-5' },
      });
      process.env.GENFEED_AGENT_MODEL = 'claude-3-7-sonnet';
      const { getActiveProfile } = await import('../../src/config/store');
      const { profile } = await getActiveProfile();
      expect(profile.agent.model).toBe('claude-3-7-sonnet');
    });
  });

  describe('setAgentModel', () => {
    it('stores the default agent model without clearing thread state', async () => {
      mockFileSystem.content = makeConfigJson({
        agent: {
          lastThreadIdByOrganization: { 'org-123': 'thread-123' },
        },
        organizationId: 'org-123',
      });
      const { getActiveProfile, setAgentModel } = await import('../../src/config/store');

      await setAgentModel('gpt-5');

      const { profile } = await getActiveProfile();
      expect(profile.agent.model).toBe('gpt-5');
      expect(profile.agent.lastThreadIdByOrganization['org-123']).toBe('thread-123');
    });
  });

  describe('agent thread persistence', () => {
    it('stores and retrieves the last thread for an organization', async () => {
      mockFileSystem.content = makeConfigJson({ organizationId: 'org-123' });
      const { getLastAgentThreadId, setLastAgentThreadId } = await import('../../src/config/store');

      await setLastAgentThreadId('thread-123');

      expect(await getLastAgentThreadId()).toBe('thread-123');
      expect(await getLastAgentThreadId('org-123')).toBe('thread-123');
    });

    it('clears the stored thread for an organization', async () => {
      mockFileSystem.content = makeConfigJson({
        agent: { lastThreadIdByOrganization: { 'org-123': 'thread-123' } },
        organizationId: 'org-123',
      });
      const { clearLastAgentThreadId, getLastAgentThreadId } = await import(
        '../../src/config/store'
      );

      await clearLastAgentThreadId();

      expect(await getLastAgentThreadId()).toBeUndefined();
    });
  });
});
