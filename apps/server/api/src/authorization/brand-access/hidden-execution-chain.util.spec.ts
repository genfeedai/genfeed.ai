import {
  CHAIN_ACTOR,
  type ExecutionFixture,
  executionContext,
  executionLookup,
  hiddenExecutionRow,
  tenantExecutionRow,
} from '@api/authorization/brand-access/hidden-execution-chain.fixture';
import {
  type HiddenWorkflowRule,
  hiddenExecutionRef,
  validateHiddenExecutionChain,
} from '@api/authorization/brand-access/hidden-execution-chain.util';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const ROOT: HiddenWorkflowRule = {
  matches: (id) => id === 'root',
  rootSources: ['queue'],
};
const CHILD: HiddenWorkflowRule = {
  holderKey: 'item',
  matches: (id) => id === 'child',
  parents: [{ nodeId: (id) => id === 'fan', rule: ROOT }],
};
const DISCOVERED_CHILD: HiddenWorkflowRule = {
  ...CHILD,
  parents: [
    {
      discovery: {
        itemsKey: 'items',
        matches: (item, holder) => item.id === holder.id,
        nodeId: 'discover',
      },
      nodeId: (id) => id === 'fan',
      rule: ROOT,
    },
  ],
};
const DAILY: HiddenWorkflowRule = {
  holderKey: 'item',
  matches: (id) => id === 'child',
  parents: [{ kind: 'scheduled-tenant' }],
};

function rootRow(overrides: Record<string, unknown> = {}) {
  return hiddenExecutionRow({
    id: 'root',
    canonicalId: 'root',
    inputValues: { initiatingActor: CHAIN_ACTOR },
    metadata: { source: 'queue' },
    ...overrides,
  });
}
function childRow(overrides: Record<string, unknown> = {}) {
  return hiddenExecutionRow({
    id: 'child',
    canonicalId: 'child',
    inputValues: { item: { id: 'one', initiatingActor: CHAIN_ACTOR } },
    metadata: {
      parentExecutionId: 'root',
      parentNodeId: 'fan',
      parentWorkflowId: 'workflow-root',
      workflowForEachIndex: 0,
      source: 'workflow.for-each:root:fan',
    },
    ...overrides,
  });
}
function harness(rows: Array<{ id: string }>) {
  const findExecution = vi.fn(executionLookup(rows));
  const findDiscovery = vi.fn().mockResolvedValue({
    output: { items: [{ id: 'one', initiatingActor: CHAIN_ACTOR }] },
  });
  const tx = {
    workflowExecution: { findFirst: findExecution },
    workflowExecutionNodeResult: { findFirst: findDiscovery },
  } as unknown as Prisma.TransactionClient;
  return { findDiscovery, findExecution, tx };
}
const ref = (row: ExecutionFixture) =>
  hiddenExecutionRef(executionContext(row));

describe('hidden execution chain validation', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  it('returns the persisted actor of a pinned hidden root', async () => {
    const root = rootRow();
    const { tx } = harness([root]);
    await expect(
      validateHiddenExecutionChain(tx, ref(root), ROOT),
    ).resolves.toMatchObject({ actor: CHAIN_ACTOR });
  });

  it('validates a fanned-out child up to its pinned hidden parent', async () => {
    const root = rootRow();
    const child = childRow();
    const { tx } = harness([root, child]);
    await expect(
      validateHiddenExecutionChain(tx, ref(child), CHILD),
    ).resolves.toMatchObject({
      actor: CHAIN_ACTOR,
      holder: { id: 'one' },
    });
  });

  it('requires the parent to have discovered this child item when configured', async () => {
    const root = rootRow();
    const child = childRow();
    const { tx, findDiscovery } = harness([root, child]);
    await expect(
      validateHiddenExecutionChain(tx, ref(child), DISCOVERED_CHILD),
    ).resolves.toMatchObject({ actor: CHAIN_ACTOR });
    findDiscovery.mockResolvedValue({
      output: { items: [{ id: 'other', initiatingActor: CHAIN_ACTOR }] },
    });
    await expect(
      validateHiddenExecutionChain(tx, ref(child), DISCOVERED_CHILD),
    ).rejects.toThrow('Brand access denied');
    findDiscovery.mockResolvedValue({
      output: {
        items: [
          { id: 'one', initiatingActor: { ...CHAIN_ACTOR, userId: 'other' } },
        ],
      },
    });
    await expect(
      validateHiddenExecutionChain(tx, ref(child), DISCOVERED_CHILD),
    ).rejects.toThrow('Brand access denied');
    findDiscovery.mockResolvedValue(null);
    await expect(
      validateHiddenExecutionChain(tx, ref(child), DISCOVERED_CHILD),
    ).rejects.toThrow('Brand access denied');
  });

  it('uses the caller-supplied denial', async () => {
    const root = rootRow({ userId: 'other' });
    const { tx } = harness([root]);
    const deny = (): never => {
      throw new ForbiddenException('custom denial');
    };
    await expect(
      validateHiddenExecutionChain(
        tx,
        { ...ref(root), userId: CHAIN_ACTOR.userId },
        ROOT,
        { deny },
      ),
    ).rejects.toThrow('custom denial');
  });

  describe('denies before any live authority is read', () => {
    it.each([
      [
        'a customer-owned workflow',
        (row: ExecutionFixture) => {
          row.workflow.organizationId = 'org';
        },
      ],
      [
        'a customer-owned workflow user',
        (row: ExecutionFixture) => {
          row.workflow.userId = 'org-user';
        },
      ],
      [
        'a deleted workflow',
        (row: ExecutionFixture) => {
          row.workflow.isDeleted = true;
        },
      ],
      [
        'metadata that is not a hidden system workflow',
        (row: ExecutionFixture) => {
          row.workflow.metadata = {};
        },
      ],
      [
        'an unpinned execution whose version belongs to another workflow',
        (row: ExecutionFixture) => {
          row.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a version owned by a customer',
        (row: ExecutionFixture) => {
          row.workflowVersion.organizationId = 'org';
        },
      ],
      [
        'a source the root rule does not admit',
        (row: ExecutionFixture) => {
          row.result.metadata.source = 'forged';
        },
      ],
      [
        'a run whose recorded canonical id differs from its workflow',
        (row: ExecutionFixture) => {
          row.result.metadata.canonicalId = 'other';
        },
      ],
      [
        'an actor of another organization',
        (row: ExecutionFixture) => {
          row.result.inputValues = {
            initiatingActor: { ...CHAIN_ACTOR, organizationId: 'foreign' },
          };
        },
      ],
      [
        'an actor that is not the execution user',
        (row: ExecutionFixture) => {
          row.result.inputValues = {
            initiatingActor: { ...CHAIN_ACTOR, userId: 'other' },
          };
        },
      ],
      [
        'a malformed actor',
        (row: ExecutionFixture) => {
          row.result.inputValues = {
            initiatingActor: { ...CHAIN_ACTOR, scopes: ['admin', 1] },
          };
        },
      ],
    ])('for %s', async (_name, tamper) => {
      const root = rootRow();
      tamper(root);
      const { tx } = harness([root]);
      await expect(
        validateHiddenExecutionChain(tx, ref(root), ROOT),
      ).rejects.toThrow('Brand access denied');
    });

    it('for a canonical id the rule does not admit', async () => {
      const root = rootRow({ canonicalId: 'other' });
      const { tx } = harness([root]);
      await expect(
        validateHiddenExecutionChain(tx, ref(root), ROOT),
      ).rejects.toThrow('Brand access denied');
    });

    it('for a context that does not match the persisted execution', async () => {
      const root = rootRow();
      const { tx } = harness([root]);
      const context = executionContext(root);
      for (const tampered of [
        { ...context, userId: 'other' },
        { ...context, workflowId: 'other' },
        { ...context, workflowVersionId: 'other' },
      ])
        await expect(
          validateHiddenExecutionChain(tx, hiddenExecutionRef(tampered), ROOT),
        ).rejects.toThrow('Brand access denied');
    });

    it('for an execution of another organization or one that is gone', async () => {
      const root = rootRow();
      const { tx } = harness([root]);
      await expect(
        validateHiddenExecutionChain(
          tx,
          { ...ref(root), organizationId: 'foreign' },
          ROOT,
        ),
      ).rejects.toThrow('Brand access denied');
      await expect(
        validateHiddenExecutionChain(
          tx,
          { ...ref(root), executionId: 'x' },
          ROOT,
        ),
      ).rejects.toThrow('Brand access denied');
    });

    it('for a child whose rule admits no parent', async () => {
      const child = childRow();
      const { tx } = harness([rootRow(), child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), {
          holderKey: 'item',
          matches: (id) => id === 'child',
          parents: [],
        }),
      ).rejects.toThrow('Brand access denied');
    });
  });

  describe('denies a child whose chain does not hold', () => {
    it.each([
      [
        'a missing parent execution',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.metadata.parentExecutionId = 'gone';
        },
      ],
      [
        'a parent workflow that does not match the recorded one',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.metadata.parentWorkflowId = 'other';
        },
      ],
      [
        'a parent owned by another user',
        (root: ExecutionFixture) => {
          root.userId = 'other';
        },
      ],
      [
        'a parent that is a customer workflow (a forged hidden child)',
        (root: ExecutionFixture) => {
          root.workflow.organizationId = 'org';
          root.workflow.metadata = {};
        },
      ],
      [
        'a parent version that is not pinned to its workflow',
        (root: ExecutionFixture) => {
          root.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a parent that is not an admitted root',
        (root: ExecutionFixture) => {
          root.result.metadata.source = 'forged';
        },
      ],
      [
        'a parent node the rule does not admit',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.metadata.parentNodeId = 'elsewhere';
        },
      ],
      [
        'a missing fan-out index',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.metadata.workflowForEachIndex = undefined;
        },
      ],
      [
        'a negative fan-out index',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.metadata.workflowForEachIndex = -1;
        },
      ],
      [
        'a forged input actor that differs from the parent actor',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.inputValues = {
            item: {
              id: 'one',
              initiatingActor: { ...CHAIN_ACTOR, scopes: ['admin'] },
            },
          };
        },
      ],
      [
        'an actor missing from the child while the parent has one',
        (_root: ExecutionFixture, child: ExecutionFixture) => {
          child.result.inputValues = { item: { id: 'one' } };
        },
      ],
      [
        'an actor missing from the parent while the child has one',
        (root: ExecutionFixture) => {
          root.result.inputValues = {};
        },
      ],
      [
        'a forged actor of another user on both levels',
        (root: ExecutionFixture, child: ExecutionFixture) => {
          const forged = { ...CHAIN_ACTOR, userId: 'victim' };
          root.result.inputValues = { initiatingActor: forged };
          child.result.inputValues = {
            item: { id: 'one', initiatingActor: forged },
          };
        },
      ],
    ])('for %s', async (_name, tamper) => {
      const root = rootRow();
      const child = childRow();
      tamper(root, child);
      const { tx } = harness([root, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), CHILD),
      ).rejects.toThrow('Brand access denied');
    });

    it('for a hidden child fanned out from a tenant workflow carrying a forged actor', async () => {
      const forged = tenantExecutionRow({ id: 'root', actor: CHAIN_ACTOR });
      forged.result.inputValues = { initiatingActor: CHAIN_ACTOR };
      const child = childRow();
      const { tx } = harness([forged, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), CHILD),
      ).rejects.toThrow('Brand access denied');
    });
  });

  describe('actor-less work', () => {
    it('is returned without checks when the caller allows an unbound level', async () => {
      const { tx, findExecution } = harness([]);
      await expect(
        validateHiddenExecutionChain(
          tx,
          { ...ref(rootRow()), executionId: 'unpersisted' },
          ROOT,
          { skipWhenUnbound: true },
        ),
      ).resolves.toMatchObject({ actor: undefined });
      expect(findExecution).toHaveBeenCalledOnce();
      const customer = rootRow({ inputValues: {} });
      customer.workflow.organizationId = 'org';
      const other = harness([customer]);
      await expect(
        validateHiddenExecutionChain(other.tx, ref(customer), ROOT, {
          skipWhenUnbound: true,
        }),
      ).resolves.toMatchObject({ actor: undefined });
    });

    it('still validates a persisted actor when unbound work is allowed', async () => {
      const root = rootRow();
      root.workflow.organizationId = 'org';
      const { tx } = harness([root]);
      await expect(
        validateHiddenExecutionChain(tx, ref(root), ROOT, {
          skipWhenUnbound: true,
        }),
      ).rejects.toThrow('Brand access denied');
    });

    it('is returned for a hidden root that persisted none', async () => {
      const root = rootRow({ inputValues: {} });
      const { tx } = harness([root]);
      await expect(
        validateHiddenExecutionChain(tx, ref(root), ROOT),
      ).resolves.toMatchObject({ actor: undefined });
    });
  });

  describe('scheduled tenant parents', () => {
    function scheduled(overrides: Record<string, unknown> = {}) {
      const parent = tenantExecutionRow({
        id: 'tenant',
        actor: CHAIN_ACTOR,
        ...overrides,
      });
      const child = hiddenExecutionRow({
        id: 'child',
        canonicalId: 'child',
        inputValues: { item: { id: 'slot' } },
        metadata: {
          parentExecutionId: 'tenant',
          parentNodeId: 'any-tenant-node',
          parentWorkflowId: parent.workflowId,
          workflowForEachIndex: 0,
        },
      });
      return { child, parent };
    }

    it('uses the server-written schedule binding of a scheduler-started run', async () => {
      const { child, parent } = scheduled();
      const { tx } = harness([parent, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), DAILY, {
          bindActorToExecutionUser: false,
        }),
      ).resolves.toMatchObject({ actor: CHAIN_ACTOR });
    });

    it.each([
      ['a manual run', { trigger: 'manual' }],
      ['an API run', { trigger: 'api' }],
      ['a run with no trigger', { trigger: null }],
      ['a run not recorded as schedule-started', { triggeredBy: 'user' }],
      ['an unbound schedule', { actor: null }],
      [
        'a seeded platform workflow, even with a stale binding on the row',
        { platformSeedKey: 'analytics.sync' },
      ],
    ])('carries no actor for %s', async (_name, overrides) => {
      const { child, parent } = scheduled(overrides);
      const { tx } = harness([parent, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), DAILY),
      ).resolves.toMatchObject({ actor: undefined });
    });

    it.each([
      [
        'a workflow of another organization',
        (parent: ExecutionFixture) => {
          parent.workflow.organizationId = 'foreign';
        },
      ],
      [
        'a deleted workflow',
        (parent: ExecutionFixture) => {
          parent.workflow.isDeleted = true;
        },
      ],
      [
        'a hidden system parent standing in as tenant',
        (parent: ExecutionFixture) => {
          parent.workflow.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
        },
      ],
      [
        'an unpinned version',
        (parent: ExecutionFixture) => {
          parent.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a parent run by another user',
        (parent: ExecutionFixture) => {
          parent.userId = 'other';
        },
      ],
    ])('denies %s', async (_name, tamper) => {
      const { child, parent } = scheduled();
      tamper(parent);
      const { tx } = harness([parent, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), DAILY),
      ).rejects.toThrow('Brand access denied');
    });

    it('denies a child item carrying an actor that is not the schedule binding', async () => {
      const { child, parent } = scheduled();
      child.result.inputValues = {
        item: { id: 'slot', initiatingActor: { ...CHAIN_ACTOR, userId: 'x' } },
      };
      const { tx } = harness([parent, child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), DAILY, {
          bindActorToExecutionUser: false,
        }),
      ).rejects.toThrow('Brand access denied');
    });

    it('does not let a child run directly without a parent claim an actor', async () => {
      const child = hiddenExecutionRow({
        id: 'child',
        canonicalId: 'child',
        inputValues: { item: { id: 'slot' } },
        metadata: { source: 'queue' },
      });
      const { tx } = harness([child]);
      await expect(
        validateHiddenExecutionChain(tx, ref(child), DAILY),
      ).rejects.toThrow('Brand access denied');
    });
  });

  describe('execution references', () => {
    const context = {
      executionId: 'run',
      organizationId: 'org',
      runId: 'run',
      userId: 'user',
      workflowId: 'workflow',
      workflowVersionId: 'version',
    };

    it('binds the engine context and falls back to the run id', () => {
      expect(
        hiddenExecutionRef({ ...context, executionId: undefined }),
      ).toEqual({
        executionId: 'run',
        organizationId: 'org',
        userId: 'user',
        workflowId: 'workflow',
        workflowVersionId: 'version',
      });
    });

    it.each([
      [{ organizationId: '' }],
      [{ userId: '' }],
      [{ executionId: ' ', runId: ' ' }],
    ])('denies an incomplete context %j', (override) => {
      expect(() => hiddenExecutionRef({ ...context, ...override })).toThrow(
        'Brand access denied',
      );
    });

    it('denies provenance that is not this execution', () => {
      const provenance = { executionId: 'run', workflowId: 'workflow' };
      expect(hiddenExecutionRef(context, provenance)).toBeDefined();
      expect(() =>
        hiddenExecutionRef(context, { ...provenance, executionId: 'other' }),
      ).toThrow('Brand access denied');
      expect(() =>
        hiddenExecutionRef(context, { ...provenance, workflowId: 'other' }),
      ).toThrow('Brand access denied');
    });
  });
});
