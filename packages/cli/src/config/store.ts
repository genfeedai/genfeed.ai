import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type Config,
  configSchema,
  defaultConfig,
  defaultProfile,
  type Profile,
} from './schema.js';

const CONFIG_DIR = path.join(os.homedir(), '.gf');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

let cachedConfig: Config | null = null;

type RuntimeProfileOverrides = Omit<Partial<Profile>, 'agent'> & {
  agent?: Partial<Profile['agent']>;
};

/**
 * Migrate legacy config keys before zod parsing (which strips unknown keys).
 * Without this, users with custom `gpuHost` values silently lose them.
 */
function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const profiles = raw.profiles as Record<string, Record<string, unknown>> | undefined;
  if (!profiles) return raw;

  for (const profile of Object.values(profiles)) {
    if ('gpuHost' in profile) {
      profile.darkroomHost = profile.gpuHost;
      delete profile.gpuHost;
    }
    if ('gpuApiPort' in profile) {
      profile.darkroomApiPort = profile.gpuApiPort;
      delete profile.gpuApiPort;
    }
    if ('agentModel' in profile) {
      const existingAgent = profile.agent;
      profile.agent = {
        ...(typeof existingAgent === 'object' && existingAgent !== null ? existingAgent : {}),
        model: profile.agentModel,
      };
      delete profile.agentModel;
    }
  }
  return raw;
}

function mergeAgentConfig(
  profileAgent: Profile['agent'],
  runtimeAgent: Partial<Profile['agent']> | undefined
): Profile['agent'] {
  return {
    ...profileAgent,
    ...runtimeAgent,
    lastThreadIdByOrganization:
      runtimeAgent?.lastThreadIdByOrganization ?? profileAgent.lastThreadIdByOrganization,
  };
}

export async function loadConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;

  try {
    const content = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(content);
    cachedConfig = configSchema.parse(migrateConfig(parsed));
    return cachedConfig;
  } catch {
    cachedConfig = structuredClone(defaultConfig);
    return cachedConfig;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  cachedConfig = config;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function resolveProfile(
  config: Config,
  explicitName?: string
): { name: string; profile: Profile } {
  const name = explicitName ?? config.activeProfile;
  const profile = config.profiles[name];

  if (!profile) {
    throw new Error(
      `Profile "${name}" does not exist. Run \`gf profile list\` to see available profiles.`
    );
  }

  return { name, profile };
}

export function mergeProfileWithRuntime(
  profile: Profile,
  runtime: RuntimeProfileOverrides
): Profile {
  return {
    ...profile,
    agent: mergeAgentConfig(profile.agent, runtime.agent),
    apiKey: runtime.apiKey ?? profile.apiKey,
    apiUrl: runtime.apiUrl ?? profile.apiUrl,
    darkroomApiPort: runtime.darkroomApiPort ?? profile.darkroomApiPort,
    darkroomHost: runtime.darkroomHost ?? profile.darkroomHost,
    organizationId: runtime.organizationId ?? profile.organizationId,
    role: runtime.role ?? profile.role,
    token: runtime.token ?? profile.token,
    userId: runtime.userId ?? profile.userId,
  };
}

export function readRuntimeOverrides(): RuntimeProfileOverrides {
  const overrides: RuntimeProfileOverrides = {};

  if (process.env.GENFEED_API_KEY) overrides.apiKey = process.env.GENFEED_API_KEY;
  if (process.env.GENFEED_API_URL) overrides.apiUrl = process.env.GENFEED_API_URL;
  if (process.env.GENFEED_TOKEN) overrides.token = process.env.GENFEED_TOKEN;
  if (process.env.GENFEED_ORGANIZATION_ID)
    overrides.organizationId = process.env.GENFEED_ORGANIZATION_ID;
  if (process.env.GENFEED_USER_ID) overrides.userId = process.env.GENFEED_USER_ID;
  if (process.env.GF_DARKROOM_HOST) overrides.darkroomHost = process.env.GF_DARKROOM_HOST;
  if (process.env.GF_DARKROOM_PORT)
    overrides.darkroomApiPort = Number(process.env.GF_DARKROOM_PORT);
  if (process.env.GENFEED_AGENT_MODEL) {
    overrides.agent = {
      ...(overrides.agent ?? {}),
      model: process.env.GENFEED_AGENT_MODEL,
    };
  }

  return overrides;
}

// Convenience getters that work with the active profile
export async function getActiveProfile(): Promise<{ name: string; profile: Profile }> {
  const config = await loadConfig();
  const runtime = readRuntimeOverrides();
  const { name, profile } = resolveProfile(config);
  return { name, profile: mergeProfileWithRuntime(profile, runtime) };
}

export async function getApiKey(): Promise<string | undefined> {
  const { profile } = await getActiveProfile();
  return profile.apiKey;
}

export async function getApiUrl(): Promise<string> {
  const { profile } = await getActiveProfile();
  return profile.apiUrl;
}

export async function getActiveBrand(): Promise<string | undefined> {
  const { profile } = await getActiveProfile();
  return profile.activeBrand;
}

export async function getDarkroomHost(): Promise<string> {
  const { profile } = await getActiveProfile();
  return profile.darkroomHost;
}

export async function getDarkroomApiPort(): Promise<number> {
  const { profile } = await getActiveProfile();
  return profile.darkroomApiPort;
}

export async function getRole(): Promise<string> {
  const { profile } = await getActiveProfile();
  return profile.role;
}

export async function setProfileField<K extends keyof Profile>(
  field: K,
  value: Profile[K],
  profileName?: string
): Promise<void> {
  const config = await loadConfig();
  const { name } = resolveProfile(config, profileName);
  (config.profiles[name] as Record<string, unknown>)[field as string] = value;
  await saveConfig(config);
}

export async function setApiKey(key: string, profileName?: string): Promise<void> {
  await setProfileField('apiKey', key, profileName);
}

export async function clearApiKey(profileName?: string): Promise<void> {
  await setProfileField('apiKey', undefined, profileName);
}

export async function setActiveBrand(brandId: string, profileName?: string): Promise<void> {
  await setProfileField('activeBrand', brandId, profileName);
}

export async function clearActiveBrand(profileName?: string): Promise<void> {
  await setProfileField('activeBrand', undefined, profileName);
}

export async function setActivePersona(handle: string, profileName?: string): Promise<void> {
  await setProfileField('activePersona', handle, profileName);
}

export async function setAgentModel(
  model: string | undefined,
  profileName?: string
): Promise<void> {
  const config = await loadConfig();
  const { name, profile } = resolveProfile(config, profileName);

  config.profiles[name] = {
    ...profile,
    agent: {
      ...profile.agent,
      model,
    },
  };

  await saveConfig(config);
}

export async function getOrganizationId(): Promise<string | undefined> {
  const { profile } = await getActiveProfile();
  return profile.organizationId;
}

export async function setOrganizationId(
  organizationId: string,
  profileName?: string
): Promise<void> {
  await setProfileField('organizationId', organizationId, profileName);
}

function resolveAgentThreadStorageKey(organizationId?: string): string {
  return organizationId || 'default';
}

export async function getLastAgentThreadId(
  organizationId?: string,
  profileName?: string
): Promise<string | undefined> {
  const config = await loadConfig();
  const runtime = readRuntimeOverrides();
  const { profile } = resolveProfile(config, profileName);
  const resolvedProfile = mergeProfileWithRuntime(profile, runtime);
  return resolvedProfile.agent.lastThreadIdByOrganization[
    resolveAgentThreadStorageKey(organizationId ?? resolvedProfile.organizationId)
  ];
}

export async function setLastAgentThreadId(
  threadId: string,
  organizationId?: string,
  profileName?: string
): Promise<void> {
  const config = await loadConfig();
  const runtime = readRuntimeOverrides();
  const { name, profile } = resolveProfile(config, profileName);
  const resolvedProfile = mergeProfileWithRuntime(profile, runtime);
  const storageKey = resolveAgentThreadStorageKey(organizationId ?? resolvedProfile.organizationId);

  config.profiles[name] = {
    ...profile,
    agent: {
      ...profile.agent,
      lastThreadIdByOrganization: {
        ...profile.agent.lastThreadIdByOrganization,
        [storageKey]: threadId,
      },
    },
  };

  await saveConfig(config);
}

export async function clearLastAgentThreadId(
  organizationId?: string,
  profileName?: string
): Promise<void> {
  const config = await loadConfig();
  const runtime = readRuntimeOverrides();
  const { name, profile } = resolveProfile(config, profileName);
  const resolvedProfile = mergeProfileWithRuntime(profile, runtime);
  const storageKey = resolveAgentThreadStorageKey(organizationId ?? resolvedProfile.organizationId);

  const lastThreadIdByOrganization = { ...profile.agent.lastThreadIdByOrganization };
  delete lastThreadIdByOrganization[storageKey];

  config.profiles[name] = {
    ...profile,
    agent: {
      ...profile.agent,
      lastThreadIdByOrganization,
    },
  };

  await saveConfig(config);
}

export async function setRole(role: 'user' | 'admin', profileName?: string): Promise<void> {
  await setProfileField('role', role, profileName);
}

export async function createProfile(name: string, profile?: Partial<Profile>): Promise<void> {
  const config = await loadConfig();
  if (config.profiles[name]) {
    throw new Error(`Profile "${name}" already exists.`);
  }

  const profileOverrides = Object.fromEntries(
    Object.entries(profile ?? {}).filter(([, value]) => value !== undefined)
  ) as Partial<Profile>;

  config.profiles[name] = {
    ...defaultProfile,
    ...profileOverrides,
    agent: {
      ...defaultProfile.agent,
      ...profileOverrides.agent,
    },
    defaults: {
      ...defaultProfile.defaults,
      ...profileOverrides.defaults,
    },
  };
  await saveConfig(config);
}

export async function setActiveProfileName(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.profiles[name]) {
    throw new Error(`Profile "${name}" does not exist.`);
  }
  config.activeProfile = name;
  await saveConfig(config);
}

export async function listProfiles(): Promise<
  { name: string; active: boolean; profile: Profile }[]
> {
  const config = await loadConfig();
  return Object.entries(config.profiles).map(([name, profile]) => ({
    active: name === config.activeProfile,
    name,
    profile,
  }));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
