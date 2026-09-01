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
    command: ['bun', 'run', 'check:cron-boundary'],
    name: 'platform cron boundary',
  },
  {
    command: ['bun', 'run', 'check:legacy-cron-surface'],
    name: 'legacy cron jobs surface',
  },
  {
    command: ['bun', 'run', 'check:product-workflow-boundary'],
    name: 'product workflow boundary',
  },
  {
    command: ['bun', 'run', 'check:bull-board-parity'],
    name: 'bull board queue parity',
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
    command: ['bun', 'run', 'check:route-shadowing'],
    name: 'controller route shadowing',
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
  {
    command: ['bun', 'run', 'check:agent-tool-dispatch'],
    name: 'agent tool dispatch coverage',
  },
  {
    command: ['bun', 'run', 'check:action-versions'],
    name: 'GitHub Action version consistency',
  },
  {
    command: ['bun', 'run', 'check:project-references'],
    name: 'project reference dependency parity',
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
    ({ command }) => {
      runContract(command, repositoryRoot);
    },
  );
});
