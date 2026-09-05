import { readWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting';
import {
  runWithWorkflowAccounting,
  workflowAccountingAttribution,
} from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { captureWorkflowCostEstimate } from '@api/collections/workflow-executions/services/workflow-cost-estimate';
import { reconcileWorkflowMediaCosts } from '@api/collections/workflow-executions/services/workflow-media-accounting-reconciliation';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createExecutableActionNode } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

function fixture() {
  return {
    ingredient: { findMany: vi.fn().mockResolvedValue([]) },
    model: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'model',
          key: 'model',
          provider: 'replicate',
          providerCostUsd: 0.01,
          pricingType: 'flat',
          updatedAt: new Date(),
        },
      ]),
    },
    workflowExecution: { findMany: vi.fn() },
    creditTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    creditReservation: { findMany: vi.fn().mockResolvedValue([]) },
    llmVendorCost: { findMany: vi.fn().mockResolvedValue([]) },
    mediaVendorCost: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workflowNodeContinuation: { findMany: vi.fn().mockResolvedValue([]) },
  };
}
const scope = {
  organizationId: 'org',
  workflowExecutionId: 'run',
  workflowNodeId: 'node',
  workflowOperationId: 'attempt',
};
describe('workflow accounting', () => {
  it('isolates concurrent node and tenant attribution', async () => {
    const result = await Promise.all(
      ['a', 'b'].map((workflowNodeId) =>
        runWithWorkflowAccounting({ ...scope, workflowNodeId }, async () => {
          await Promise.resolve();
          expect(workflowAccountingAttribution('other-org')).toEqual({});
          return workflowAccountingAttribution('org').workflowNodeId;
        }),
      ),
    );
    expect(result).toEqual(['a', 'b']);
    expect(workflowAccountingAttribution('org')).toEqual({});
  });
  it('quotes real action envelopes and retains unresolved runtime duration', async () => {
    const db = fixture();
    const nodes = [
      createExecutableActionNode({
        actionId: 'imageGen',
        id: 'image',
        parameters: { model: 'model' },
      }),
    ];
    const first = await captureWorkflowCostEstimate(
      db as unknown as PrismaService,
      'org',
      nodes,
    );
    expect(first.estimatedCredits).toBeGreaterThan(0);
    expect(first.nodes[0]?.model).toBe('model');
    db.model.findMany.mockResolvedValue([
      {
        id: 'model',
        key: 'model',
        provider: 'replicate',
        providerCostUsd: 0.01,
        pricingType: 'per-second',
        updatedAt: new Date(),
      },
    ]);
    const dynamic = await captureWorkflowCostEstimate(
      db as unknown as PrismaService,
      'org',
      nodes,
    );
    expect(dynamic.estimatedCredits).toBeNull();
    expect(dynamic.nodes[0]?.unresolvedReason).toBe('runtime_duration');
  });
  it('keeps refunds fractional, node totals exact, and missing provider evidence unavailable', async () => {
    const db = fixture();
    db.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run',
        status: 'COMPLETED',
        costEstimate: null,
        nodeResults: [{ nodeId: 'a' }, { nodeId: 'b' }],
      },
    ]);
    db.creditTransaction.findMany.mockResolvedValue([
      {
        workflowExecutionId: 'run',
        workflowNodeId: 'a',
        category: 'deduct',
        amount: 0.1,
      },
      {
        workflowExecutionId: 'run',
        workflowNodeId: 'a',
        category: 'refund',
        amount: 0.03,
      },
      {
        workflowExecutionId: 'run',
        workflowNodeId: 'b',
        category: 'deduct',
        amount: 0.2,
      },
    ]);
    const result = await readWorkflowAccounting(
      db as unknown as PrismaService,
      'org',
      'run',
    );
    expect(result?.actualCredits).toBe(0.27);
    expect(result?.nodes[0]?.knownActualCredits).toBe(0.07);
    expect(result?.actualProviderCostMicros).toBeNull();
    expect(result?.estimatedCredits).toBeNull();
    expect(db.creditTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          workflowExecutionId: { in: ['run'] },
          isDeleted: false,
        },
      }),
    );
  });
  it('preserves pending reservations and incorporates late cancelled-run evidence', async () => {
    const db = fixture();
    db.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run',
        status: 'CANCELLED',
        costEstimate: null,
        nodeResults: [{ nodeId: 'a' }],
      },
    ]);
    db.creditReservation.findMany.mockResolvedValue([
      {
        workflowExecutionId: 'run',
        workflowNodeId: 'a',
        amount: 3.5,
        status: 'RESERVED',
      },
    ]);
    expect(
      (
        await readWorkflowAccounting(
          db as unknown as PrismaService,
          'org',
          'run',
        )
      )?.nodes[0]?.state,
    ).toBe('reserved');
    db.creditReservation.findMany.mockResolvedValue([]);
    db.creditTransaction.findMany.mockResolvedValue([
      {
        workflowExecutionId: 'run',
        workflowNodeId: 'a',
        amount: 1.25,
        category: 'deduct',
      },
    ]);
    expect(
      (
        await readWorkflowAccounting(
          db as unknown as PrismaService,
          'org',
          'run',
        )
      )?.actualCredits,
    ).toBe(1.25);
  });
  it('does not query ledgers for another tenant execution', async () => {
    const db = fixture();
    db.workflowExecution.findMany.mockResolvedValue([]);
    expect(
      await readWorkflowAccounting(
        db as unknown as PrismaService,
        'org',
        'foreign',
      ),
    ).toBeNull();
    expect(db.creditTransaction.findMany).not.toHaveBeenCalled();
  });
  it('recovers a failed completion write from persisted output using submission pricing', async () => {
    const db = fixture();
    db.mediaVendorCost.findMany.mockResolvedValue([
      {
        id: 'intent',
        ingredientId: 'output',
        pricingSnapshot: {
          providerCostUsd: 0.1,
          pricingType: 'per-second',
          isByok: false,
        },
      },
    ]);
    db.ingredient.findMany.mockResolvedValue([
      {
        id: 'output',
        metadata: { duration: 2.5, width: 100, height: 100, isDeleted: false },
      },
    ]);
    await reconcileWorkflowMediaCosts(db as unknown as PrismaService, 'org', [
      'run',
    ]);
    expect(db.mediaVendorCost.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'intent',
        organizationId: 'org',
        isDeleted: false,
        costEvidence: { in: ['pending', 'unknown'] },
      },
      data: {
        units: 2.5,
        isByok: false,
        vendorCostMicros: 250000,
        costEvidence: 'calculated',
      },
    });
  });
});
