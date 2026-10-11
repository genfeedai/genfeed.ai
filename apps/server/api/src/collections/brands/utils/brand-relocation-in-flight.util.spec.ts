import {
  assertNoInFlightBrandWork,
  assertNoInFlightBreakoutWork,
  assertNoInFlightTurboRuns,
  assertNoInFlightWorkflowWork,
  assertNoOpenExecutionCreditHolds,
  assertNoUnresolvedPublishReceipts,
  assertNoWorkflowExecutionReadHistory,
} from '@api/collections/brands/utils/brand-relocation-in-flight.util';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

type Finder = ReturnType<typeof vi.fn>;

function emptyClient() {
  const finder = (): { findFirst: Finder } => ({
    findFirst: vi.fn().mockResolvedValue(null),
  });
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ hasOpenHold: false }]),
    breakoutResponse: finder(),
    breakoutResponseOutput: finder(),
    postProviderPublishReceipt: finder(),
    turboRun: finder(),
    workflowExecution: finder(),
    workflowExecutionReadBrandDependency: finder(),
    workflowExecutionReadScope: finder(),
    workflowNodeContinuation: finder(),
  };
}

const asTx = (client: ReturnType<typeof emptyClient>) =>
  client as unknown as Prisma.TransactionClient;

describe('brand relocation in-flight guards (#6689)', () => {
  it('permits a quiet brand through every guard', async () => {
    const client = emptyClient();

    await expect(
      assertNoInFlightBrandWork(asTx(client), 'brand', 'org'),
    ).resolves.toBeUndefined();
  });

  describe('workflow executions and continuations', () => {
    it('counts only pending and running executions of the brand workflows, in the source organization', async () => {
      const client = emptyClient();

      await assertNoInFlightWorkflowWork(asTx(client), 'brand', 'org');

      expect(client.workflowExecution.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: 'org',
          status: { in: ['PENDING', 'RUNNING'] },
          workflow: { brandId: 'brand' },
        },
      });
    });

    it('keeps a continuation open until it completed or failed', async () => {
      const client = emptyClient();

      await assertNoInFlightWorkflowWork(asTx(client), 'brand', 'org');

      expect(client.workflowNodeContinuation.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          execution: { workflow: { brandId: 'brand' } },
          organizationId: 'org',
          status: { notIn: ['COMPLETED', 'FAILED'] },
        },
      });
    });

    it.each(['workflowExecution', 'workflowNodeContinuation'] as const)(
      'refuses with a conflict when %s work is open',
      async (delegate) => {
        const client = emptyClient();
        client[delegate].findFirst.mockResolvedValue({ id: 'open' });

        await expect(
          assertNoInFlightWorkflowWork(asTx(client), 'brand', 'org'),
        ).rejects.toThrow(ConflictException);
      },
    );
  });

  describe('credit holds', () => {
    it('looks for a reserved hold attributed to the brand or to one of its executions', async () => {
      const client = emptyClient();

      await assertNoOpenExecutionCreditHolds(asTx(client), 'brand', 'org');

      const [statement] = client.$queryRaw.mock.calls[0];
      expect(statement.sql).toContain('"credit_reservations"');
      expect(statement.sql).toContain('r."brandId"');
      expect(statement.sql).toContain('r."workflowExecutionId" IN');
      expect(statement.sql).toContain('"CreditReservationStatus"');
      expect(statement.values).toEqual([
        'org',
        'RESERVED',
        'brand',
        'org',
        'brand',
      ]);
    });

    it('refuses while a hold is open', async () => {
      const client = emptyClient();
      client.$queryRaw.mockResolvedValue([{ hasOpenHold: true }]);

      await expect(
        assertNoOpenExecutionCreditHolds(asTx(client), 'brand', 'org'),
      ).rejects.toThrow(/open credit holds/);
    });

    it('refuses rather than guess when the answer cannot be read', async () => {
      const client = emptyClient();
      client.$queryRaw.mockResolvedValue([]);

      await expect(
        assertNoOpenExecutionCreditHolds(asTx(client), 'brand', 'org'),
      ).rejects.toThrow(/could not be confirmed/);
    });
  });

  describe('provider publish receipts', () => {
    it('refuses attempting and uncertain receipts of the brand posts', async () => {
      const client = emptyClient();
      client.postProviderPublishReceipt.findFirst.mockResolvedValue({
        id: 'receipt',
      });

      await expect(
        assertNoUnresolvedPublishReceipts(asTx(client), 'brand', 'org'),
      ).rejects.toThrow(/still being resolved/);
      expect(client.postProviderPublishReceipt.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: 'org',
          post: { brandId: 'brand' },
          status: { in: ['attempting', 'uncertain'] },
        },
      });
    });
  });

  describe('Turbo runs', () => {
    it('refuses a pending or processing run', async () => {
      const client = emptyClient();
      client.turboRun.findFirst.mockResolvedValue({ id: 'run' });

      await expect(
        assertNoInFlightTurboRuns(asTx(client), 'brand', 'org'),
      ).rejects.toThrow(/Turbo run in progress/);
      expect(client.turboRun.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: 'brand',
          isDeleted: false,
          organizationId: 'org',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      });
    });
  });

  describe('breakout responses', () => {
    it('refuses a planned response or a reserved or in-flight output, but not a merely detected response', async () => {
      const client = emptyClient();

      await assertNoInFlightBreakoutWork(asTx(client), 'brand', 'org');

      expect(client.breakoutResponse.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: 'brand',
          isDeleted: false,
          organizationId: 'org',
          state: { in: ['planned'] },
        },
      });
      expect(client.breakoutResponseOutput.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: 'brand',
          isDeleted: false,
          organizationId: 'org',
          state: { in: ['generation_in_flight', 'reserved'] },
        },
      });
    });

    it.each(['breakoutResponse', 'breakoutResponseOutput'] as const)(
      'refuses when a %s row is in flight',
      async (delegate) => {
        const client = emptyClient();
        client[delegate].findFirst.mockResolvedValue({ id: 'open' });

        await expect(
          assertNoInFlightBreakoutWork(asTx(client), 'brand', 'org'),
        ).rejects.toThrow(/breakout responses in progress/);
      },
    );
  });

  describe('execution read-scope history', () => {
    it('reaches the brand through the execution, thread, strategy and batch version, deleted rows included', async () => {
      const client = emptyClient();

      await assertNoWorkflowExecutionReadHistory(asTx(client), 'brand', 'org');

      const [scopeQuery] =
        client.workflowExecutionReadScope.findFirst.mock.calls[0];
      expect(scopeQuery.where.organizationId).toBe('org');
      expect(scopeQuery.where.OR).toEqual([
        { execution: { workflow: { brandId: 'brand' } } },
        { proactiveThread: { brandId: 'brand' } },
        { proactiveStrategy: { brandId: 'brand' } },
        { batchChildVersion: { workflow: { brandId: 'brand' } } },
      ]);
      expect(scopeQuery.where).not.toHaveProperty('isDeleted');
      expect(
        client.workflowExecutionReadBrandDependency.findFirst,
      ).toHaveBeenCalledWith({
        select: { executionId: true },
        where: { brandId: 'brand', organizationId: 'org' },
      });
    });

    it.each([
      'workflowExecutionReadScope',
      'workflowExecutionReadBrandDependency',
    ] as const)('refuses on a %s row', async (delegate) => {
      const client = emptyClient();
      client[delegate].findFirst.mockResolvedValue({ executionId: 'e' });

      await expect(
        assertNoWorkflowExecutionReadHistory(asTx(client), 'brand', 'org'),
      ).rejects.toThrow(/append-only/);
    });
  });
});
