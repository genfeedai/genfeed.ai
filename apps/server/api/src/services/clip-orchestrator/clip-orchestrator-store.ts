import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const STATE_DIRECTORY =
  process.env.GENFEED_CLIP_ORCHESTRATOR_STATE_DIR ??
  join(process.cwd(), '.genfeed', 'clip-orchestrator');

function getStorePath(name: string): string {
  return join(STATE_DIRECTORY, `${name}.json`);
}

export function loadClipOrchestratorMap<T>(
  name: string,
  revive?: (value: T) => T,
): Map<string, T> {
  const path = getStorePath(name);
  if (!existsSync(path)) {
    return new Map();
  }

  const entries = JSON.parse(readFileSync(path, 'utf8')) as [string, T][];
  return new Map(
    entries.map(([key, value]) => [key, revive ? revive(value) : value]),
  );
}

export function saveClipOrchestratorMap<T>(
  name: string,
  map: Map<string, T>,
): void {
  mkdirSync(STATE_DIRECTORY, { recursive: true });
  writeFileSync(
    getStorePath(name),
    JSON.stringify(Array.from(map.entries()), null, 2),
    'utf8',
  );
}
