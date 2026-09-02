import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_QUEUE_NAMES,
  CONSUMED_QUEUE_NAMES,
  UNCONSUMED_QUEUE_NAMES,
} from '@genfeedai/contracts/queue';
import { describe, expect, it } from 'vitest';

const WORKERS_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_CONTRACTS_SRC = join(
  WORKERS_SRC,
  '../../../../packages/contracts/src/queue',
);

function walkTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .reduce<string[]>((files, entry) => {
      if (entry === 'node_modules' || entry === 'dist') {
        return files;
      }

      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...walkTypeScriptFiles(full));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
        files.push(full);
      }

      return files;
    }, []);
}

/**
 * `@Processor(...)` is called with the exported constant, not a literal, so map
 * the constant names back to their wire values from the contracts package.
 */
function readQueueNameByConstant(): Map<string, string> {
  const source = readFileSync(
    join(QUEUE_CONTRACTS_SRC, 'queue-names.constant.ts'),
    'utf-8',
  );
  const pattern = /export const (\w+_QUEUE) = '([^']+)';/g;
  const byConstant = new Map<string, string>();

  let match: RegExpExecArray | null = pattern.exec(source);
  while (match !== null) {
    byConstant.set(match[1], match[2]);
    match = pattern.exec(source);
  }

  return byConstant;
}

function readRegisteredQueueNames(): Set<string> {
  const queueNameByConstant = readQueueNameByConstant();
  const registered = new Set<string>();

  for (const file of walkTypeScriptFiles(WORKERS_SRC)) {
    const pattern = /@Processor\(\s*([\w.]+)/g;
    const source = readFileSync(file, 'utf-8');

    let match: RegExpExecArray | null = pattern.exec(source);
    while (match !== null) {
      const resolved = queueNameByConstant.get(match[1]);
      if (resolved) {
        registered.add(resolved);
      }
      match = pattern.exec(source);
    }
  }

  return registered;
}

describe('queue consumer coverage', () => {
  const registered = readRegisteredQueueNames();

  it('finds the workers runtime processors', () => {
    expect(registered.size).toBeGreaterThan(0);
  });

  it('registers a processor for every queue declared as consumed', () => {
    const missing = CONSUMED_QUEUE_NAMES.filter(
      (name) => !registered.has(name),
    );

    expect(missing).toEqual([]);
  });

  it('keeps the unconsumed list honest — remove a queue once its processor lands', () => {
    const nowConsumed = UNCONSUMED_QUEUE_NAMES.filter((name) =>
      registered.has(name),
    );

    expect(nowConsumed).toEqual([]);
  });

  it('accounts for every contract queue exactly once', () => {
    expect([...CONSUMED_QUEUE_NAMES, ...UNCONSUMED_QUEUE_NAMES].sort()).toEqual(
      [...ALL_QUEUE_NAMES].sort(),
    );
  });
});
