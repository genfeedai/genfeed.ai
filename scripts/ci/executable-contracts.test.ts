import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { runContract } from './executable-contract-runner';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Repository contracts that used to be one named YAML step each.
 * Product behavior lives here so a dead rule is deleted with its test,
 * not left as a forever-green workflow gate.
 */
const REPOSITORY_CONTRACTS = [
  {
    command: ['bun', 'run', 'check:architecture'],
    name: 'architecture guards',
  },
  {
    command: ['bun', 'run', 'check:di-value-imports'],
    name: 'DI value imports',
  },
  {
    command: ['bun', 'run', 'check:untranslated-strings'],
    name: 'untranslated string ratchet',
  },
  {
    command: ['bun', 'run', 'check:inline-types'],
    name: 'inline type ratchet',
  },
  {
    // CI setup exports its actual runtime identity for the task hash. Without
    // it (for example, a local run), never trust a receipt from an older Bun.
    command: [
      'bunx',
      'turbo',
      'run',
      'check:import-cycles',
      ...(process.env.CI_CHECK_RUNTIME ? [] : ['--force']),
    ],
    name: 'import cycles',
  },
  {
    command: ['bun', 'run', 'check:type-assertions'],
    name: 'type assertions',
  },
  {
    command: ['bun', 'run', 'check:relation-alias-reads'],
    name: 'relation alias reads',
  },
  {
    command: ['bun', 'run', 'check:relation-alias-writes'],
    name: 'relation alias writes',
  },
  {
    command: ['bun', 'run', 'check:runtime-complexity'],
    name: 'runtime complexity ratchet',
  },
  {
    command: ['bun', 'run', 'check:route-inventory'],
    name: 'product route inventory',
  },
  { command: ['bun', 'run', 'check:tenant-scope'], name: 'tenant scope' },
  {
    command: ['bun', 'run', 'check:test-id-literals'],
    name: 'test id literal guard',
  },
  { command: ['bun', 'run', 'check:ui-guards'], name: 'UI guards' },
  { command: ['bun', 'run', 'design:check'], name: 'design system contracts' },
  {
    command: ['bun', 'run', 'check:serializer-drift'],
    name: 'serializer drift',
  },
  { command: ['bun', 'run', 'audit:api:sql:ci'], name: 'SQL risk audit' },
  {
    command: ['bun', 'run', 'check:public-packages'],
    name: 'public package manifests',
  },
  {
    command: ['bun', 'run', 'check:npm-release'],
    name: 'npm release enrollment',
  },
  {
    command: [
      'bun',
      'run',
      '--filter=@genfeedai/prisma',
      'check:model-metadata',
    ],
    name: 'Prisma model metadata drift',
  },
] as const;

describe('executable repository contracts', () => {
  it.each(REPOSITORY_CONTRACTS)(
    '$name holds on this repository',
    { timeout: 180_000 },
    ({ command, name }) => {
      runContract(command, repositoryRoot, name);
    },
  );
});
