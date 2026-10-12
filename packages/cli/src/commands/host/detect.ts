import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import type { NativeHostProviderStatus } from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import { type CliProviderDefinition, isApiProvider, PROVIDER_CATALOG } from './catalog';
import type { HostConfig } from './config';

export interface DetectionEnvironment {
  homeDirectory: string;
  /** The host's PATH value. Chrome starts hosts with a minimal one, so the launcher sets it. */
  pathValue: string | undefined;
  /** System-wide install locations searched after PATH. */
  systemDirectories?: readonly string[];
}

const DEFAULT_SYSTEM_DIRECTORIES = ['/opt/homebrew/bin', '/usr/local/bin'] as const;

/** Where user-level installs of these CLIs usually land, on top of PATH. */
function conventionalBinDirectories(homeDirectory: string): string[] {
  return [
    path.join(homeDirectory, '.local', 'bin'),
    path.join(homeDirectory, '.bun', 'bin'),
    path.join(homeDirectory, '.npm-global', 'bin'),
  ];
}

export function searchDirectories(environment: DetectionEnvironment): string[] {
  const fromPath = (environment.pathValue ?? '')
    .split(path.delimiter)
    .filter((entry) => entry.length > 0 && path.isAbsolute(entry));
  return [
    ...new Set([
      ...fromPath,
      ...conventionalBinDirectories(environment.homeDirectory),
      ...(environment.systemDirectories ?? DEFAULT_SYSTEM_DIRECTORIES),
    ]),
  ];
}

/**
 * Finds an executable by looking at the filesystem only: it is never run, not
 * even for `--version`. A regular file the user may execute counts.
 */
export async function findExecutable(
  name: string,
  directories: readonly string[]
): Promise<string | null> {
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Missing, unreadable or not executable: keep looking.
    }
  }
  return null;
}

export async function resolveCliExecutable(
  provider: CliProviderDefinition,
  environment: DetectionEnvironment
): Promise<string | null> {
  return findExecutable(provider.executable, searchDirectories(environment));
}

/** Reports every provider the host could run. Nothing is executed, and no key leaves the config. */
export async function detectProviders(
  environment: DetectionEnvironment,
  config: HostConfig
): Promise<NativeHostProviderStatus[]> {
  const directories = searchDirectories(environment);
  return Promise.all(
    PROVIDER_CATALOG.map(async (provider) => ({
      id: provider.id,
      isAvailable: isApiProvider(provider)
        ? config.providers[provider.id] !== undefined
        : (await findExecutable(provider.executable, directories)) !== null,
      kind: provider.kind,
      label: provider.label,
    }))
  );
}
