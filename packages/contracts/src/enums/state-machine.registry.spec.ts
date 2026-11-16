import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STATE_MACHINE_CATALOG,
  type StateMachineCatalogEntry,
} from './state-machine.registry';

const ENUMS_DIR = __dirname;
const CATALOG_DOC = join(
  ENUMS_DIR,
  '../../../../docs/architecture/state-machines.md',
);

function renderEntry(entry: StateMachineCatalogEntry): string {
  const { machine } = entry;
  const rows = machine.states.map((from) => {
    const next = machine.next(from);
    const targets = next.length
      ? next.map((to) => `\`${to}\``).join(', ')
      : '—';
    const settled = machine.isTerminal(from) ? 'yes' : 'no';
    return `| \`${from}\` | ${settled} | ${targets} |`;
  });
  return [
    `## \`${entry.column}\``,
    '',
    `Constant: \`${entry.constant}\` in \`@genfeedai/contracts\`.`,
    '',
    '| From | Settled | Can move to |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
}

function renderCatalog(): string {
  return [
    '# Status state machines',
    '',
    'Generated from `STATE_MACHINE_CATALOG` in `packages/contracts/src/enums/state-machine.registry.ts`.',
    'Do not edit by hand: run `UPDATE_STATE_MACHINE_DOC=1 bunx vitest run state-machine.registry`',
    'in `packages/contracts` after changing a table.',
    '',
    'Each table is the set of edges a writer may take. Writers stay compare-and-set:',
    '`machine.sourcesOf(to)` is the `status: { in }` list for an `updateMany`. "Settled"',
    'means the lifecycle is finished for polling and display; a settled state may still',
    'have an explicit edge (a retry, or a discarded batch).',
    '',
    'Lifecycles that are explicit but not built with `defineStateMachine`:',
    '`Post.targetExecutionState` (`POST_LIFECYCLE_TRANSITIONS`), `Task.status`',
    '(`STATUS_TRANSITIONS`), `PublishApproval.status`',
    '(`canTransitionPublishApprovalStatus`), `BrandedGenerationReceipt.state`',
    '(`canTransitionBrandedGenerationStateV1`) and the agent chat stream phase',
    '(`docs/architecture/agent-chat-stream-phases.md`). `docs/architecture/status-columns.md`',
    'lists every plain-string status column and how explicit its lifecycle is.',
    '',
    STATE_MACHINE_CATALOG.map(renderEntry).join('\n\n'),
    '',
  ].join('\n');
}

describe('STATE_MACHINE_CATALOG', () => {
  it('lists every machine defined in the enum files', () => {
    const defined = readdirSync(ENUMS_DIR)
      .filter((file) => file.endsWith('.enum.ts'))
      .flatMap((file) =>
        [
          ...readFileSync(join(ENUMS_DIR, file), 'utf8').matchAll(
            /export const (\w+) =\s*defineStateMachine</g,
          ),
        ].map((match) => match[1]),
      )
      .sort();

    expect(STATE_MACHINE_CATALOG.map((entry) => entry.constant).sort()).toEqual(
      defined,
    );
  });

  it('has one entry per column', () => {
    const columns = STATE_MACHINE_CATALOG.map((entry) => entry.column);

    expect(new Set(columns).size).toBe(columns.length);
  });

  it('matches docs/architecture/state-machines.md', () => {
    if (process.env.UPDATE_STATE_MACHINE_DOC === '1') {
      writeFileSync(CATALOG_DOC, renderCatalog());
    }

    expect(readFileSync(CATALOG_DOC, 'utf8')).toBe(renderCatalog());
  });
});
