import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const HOST_DIRECTORY_MODE = 0o700;
const HOST_FILE_MODE = 0o600;

export interface HostPaths {
  configPath: string;
  hostDirectory: string;
  launcherPath: string;
}

/**
 * Where the host keeps its files. Separate from the CLI's own `~/.gf/config.json`:
 * the host never reads Genfeed credentials.
 */
export function resolveHostPaths(homeDirectory: string = os.homedir()): HostPaths {
  const hostDirectory = path.join(homeDirectory, '.gf', 'host');
  return {
    configPath: path.join(hostDirectory, 'config.json'),
    hostDirectory,
    launcherPath: path.join(hostDirectory, 'genfeed-host'),
  };
}

const apiProviderConfigSchema = z.strictObject({
  apiKey: z.string().min(1).max(512),
  model: z.string().min(1).max(128),
});

export const hostConfigSchema = z.strictObject({
  /** `chrome-extension://<id>/` origins the install registered; the host refuses any other. */
  allowedOrigins: z.array(z.string().min(1).max(128)).max(16),
  /** Bring-your-own-key providers. The keys stay in this file and never leave the host. */
  providers: z.strictObject({
    'anthropic-api': apiProviderConfigSchema.optional(),
    'gemini-api': apiProviderConfigSchema.optional(),
    'openai-api': apiProviderConfigSchema.optional(),
  }),
});

export type HostConfig = z.infer<typeof hostConfigSchema>;
export type ApiProviderConfig = z.infer<typeof apiProviderConfigSchema>;

export class HostConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostConfigError';
  }
}

export function emptyHostConfig(): HostConfig {
  return { allowedOrigins: [], providers: {} };
}

export async function readHostConfig(paths: HostPaths): Promise<HostConfig> {
  let content: string;
  try {
    content = await readFile(paths.configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyHostConfig();
    throw new HostConfigError(`Could not read ${paths.configPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HostConfigError(`${paths.configPath} is not valid JSON`);
  }
  const result = hostConfigSchema.safeParse(parsed);
  if (!result.success) throw new HostConfigError(`${paths.configPath} is not a valid host config`);
  return result.data;
}

/** Writes through a private temp file so a crash never leaves a half-written key file. */
export async function writeHostConfig(paths: HostPaths, config: HostConfig): Promise<void> {
  await mkdir(paths.hostDirectory, { mode: HOST_DIRECTORY_MODE, recursive: true });
  await chmod(paths.hostDirectory, HOST_DIRECTORY_MODE);
  const temporaryPath = `${paths.configPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: HOST_FILE_MODE,
  });
  await chmod(temporaryPath, HOST_FILE_MODE);
  await rename(temporaryPath, paths.configPath);
  await chmod(paths.configPath, HOST_FILE_MODE);
}
