import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRepoPath } from '../provenance';
import { GENERATION_TYPES } from './generation-types';
import { MODEL_CALLERS } from './model-callers';

const API_ROOT = 'apps/server/api/src';
const MODEL_CALL =
  /\b(LlmDispatcherService|chatCompletionForRoute|OpenRouterService|PromptEnhancementService)\b/;
const SKIPPED =
  /(\.spec\.ts|\.test\.ts|\.module\.ts|\/dto\/|\/__tests__\/|integrations\/(llm|openrouter)\/)/;

function sweep(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sweep(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const REPO_ROOT = resolveRepoPath('.');

function modelCallers(): string[] {
  return sweep(join(REPO_ROOT, API_ROOT))
    .map((path) => relative(REPO_ROOT, path).replaceAll('\\', '/'))
    .filter(
      (path) =>
        !SKIPPED.test(path) &&
        MODEL_CALL.test(readFileSync(join(REPO_ROOT, path), 'utf8')),
    )
    .sort();
}

const CALLERS: readonly string[] = modelCallers();

const REGISTERED: ReadonlySet<string> = new Set(
  GENERATION_TYPES.flatMap((entry) => [
    ...(entry.source ? [entry.source] : []),
    ...(entry.alsoCovers ?? []),
  ]),
);

describe('model-calling services', () => {
  it('puts every file that calls a model in a registry row or the exemption list', () => {
    const unaccounted = CALLERS.filter(
      (path) => !REGISTERED.has(path) && !(path in MODEL_CALLERS),
    );
    expect(
      unaccounted,
      'These files call a model but have no row in generation-types.ts (source or alsoCovers) and no entry in model-callers.ts',
    ).toEqual([]);
  });

  it('keeps the exemption list free of stale or doubled entries', () => {
    const callers = new Set(CALLERS);
    const stale = Object.keys(MODEL_CALLERS).filter(
      (path) => !callers.has(path) || REGISTERED.has(path),
    );
    expect(
      stale,
      'These entries no longer call a model, or now have a registry row; remove them from model-callers.ts',
    ).toEqual([]);
  });

  it('points every registry caller at a file that exists', () => {
    const missing = [...REGISTERED].filter(
      (path) => !existsSync(join(REPO_ROOT, path)),
    );
    expect(missing).toEqual([]);
  });

  it('gives every exemption a reason', () => {
    for (const [path, entry] of Object.entries(MODEL_CALLERS)) {
      expect(entry.note, `${path} needs a reason`).toBeTruthy();
    }
  });
});
