/**
 * Argv parsing for `run.ts`, kept pure so the refusal paths (no spend cap,
 * bad suite) are unit-tested without spawning a process.
 */

import type { ContentEvalCliArgs } from './contracts';
import {
  CONTENT_EVAL_THRESHOLDS,
  DISPATCHER_KINDS,
  SUITE_NAMES,
} from './contracts';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Suite-specific flags (e.g. the media ladder's) are read with this too. */
export function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function requireFlag(argv: string[], name: string, hint: string): string {
  const value = readFlag(argv, name);
  if (value === undefined || value.trim() === '') {
    throw new UsageError(`--${name} is required: ${hint}`);
  }

  return value;
}

function readNumber(name: string, raw: string): number {
  const parsed = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(parsed)) {
    throw new UsageError(`--${name} must be a number, got "${raw}"`);
  }

  return parsed;
}

function readList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readEnum<TValue extends string>(
  name: string,
  raw: string,
  values: readonly TValue[],
): TValue {
  const match = values.find((value) => value === raw);
  if (!match) {
    throw new UsageError(
      `--${name} must be one of ${values.join(', ')}, got "${raw}"`,
    );
  }

  return match;
}

export function parseCliArgs(argv: string[]): ContentEvalCliArgs {
  // Checked first: an uncapped run is refused before anything else is read.
  const maxCredits = readNumber(
    'max-credits',
    requireFlag(
      argv,
      'max-credits',
      'every run needs a spend cap in credits (1 credit = $0.01); the harness refuses to run uncapped',
    ),
  );
  if (maxCredits <= 0) {
    throw new UsageError('--max-credits must be positive');
  }

  const tieBand = readNumber(
    'tie-band',
    readFlag(argv, 'tie-band') ??
      String(CONTENT_EVAL_THRESHOLDS.pointwiseTieBand),
  );
  if (tieBand < 0 || tieBand > 1) {
    throw new UsageError('--tie-band must be between 0 and 1');
  }

  const judgeRegistryKeys = readList(
    requireFlag(argv, 'judge', 'judge model registry key(s)'),
  );
  if (judgeRegistryKeys.length === 0) {
    throw new UsageError('--judge needs at least one registry key');
  }

  return {
    dispatcherKind: readEnum(
      'dispatcher',
      readFlag(argv, 'dispatcher') ?? 'stub',
      DISPATCHER_KINDS,
    ),
    fixturePath: requireFlag(argv, 'fixture', 'path to a JSONL fixture'),
    judgeRegistryKeys,
    maxCredits,
    models: readList(readFlag(argv, 'models')),
    out: readFlag(argv, 'out') ?? null,
    seed: Math.trunc(readNumber('seed', readFlag(argv, 'seed') ?? '1')),
    suite: readEnum(
      'suite',
      requireFlag(argv, 'suite', SUITE_NAMES.join('|')),
      SUITE_NAMES,
    ),
    tieBand,
  };
}
