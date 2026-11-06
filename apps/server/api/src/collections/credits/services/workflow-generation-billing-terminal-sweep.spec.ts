import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

const now = new Date('2026-10-26T10:00:00.000Z');
const old = new Date('2026-10-26T09:00:00.000Z');

interface Hold {
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: CreditReservationStatus;
  workloadId: string | null;
  workloadType: string;
}

interface Execution {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: string;
}

function hold(
  id: string,
  workloadId: string,
  overrides: Partial<Hold> = {},
): Hold {
  return {
    createdAt: old,
    id,
    isDeleted: false,
    organizationId: 'org-a',
    status: CreditReservationStatus.RESERVED,
    workloadId,
    workloadType: 'workflow-generation',
    ...overrides,
  };
}

function execution(
  id: string,
  status: string,
  organizationId = 'org-a',
): Execution {
  return { id, isDeleted: false, organizationId, status };
}

describe('WorkflowGenerationBillingService.reconcileTerminalExecutions', () => {
  let holds: Hold[];
  let executions: Execution[];
  let failingCloses: Set<string>;
  let errors: Array<{ context: unknown; message: string }>;
  let service: WorkflowGenerationBillingService;

  const statusOf = (id: string) => holds.find((row) => row.id === id)?.status;

  beforeEach(() => {
    holds = [];
    executions = [];
    failingCloses = new Set();
    errors = [];

    service = new WorkflowGenerationBillingService(
      {
        creditReservation: {
          findMany: async ({
            cursor,
            skip = 0,
            take,
            where,
          }: {
            cursor?: { id: string };
            skip?: number;
            take: number;
            where: {
              createdAt: { lte: Date };
              isDeleted: boolean;
              status: string;
              workloadType: string;
            };
          }) => {
            const matching = holds
              .filter(
                (row) =>
                  row.createdAt <= where.createdAt.lte &&
                  row.isDeleted === where.isDeleted &&
                  row.status === where.status &&
                  row.workloadId !== null &&
                  row.workloadType === where.workloadType,
              )
              .sort((a, b) => a.id.localeCompare(b.id));
            const start = cursor
              ? matching.findIndex((row) => row.id === cursor.id) + skip
              : 0;
            return matching.slice(start, start + take);
          },
        },
        workflowExecution: {
          findFirst: async ({
            where,
          }: {
            where: {
              id: string;
              isDeleted: boolean;
              organizationId: string;
              status: { in: string[] };
            };
          }) =>
            executions.find(
              (row) =>
                row.id === where.id &&
                row.isDeleted === where.isDeleted &&
                row.organizationId === where.organizationId &&
                where.status.in.includes(row.status),
            ) ?? null,
        },
      } as unknown as PrismaService,
      {} as CreditsUtilsService,
      {
        error: (message: string, _error: unknown, context: unknown) => {
          errors.push({ context, message });
        },
      } as unknown as LoggerService,
    );

    // The close itself is covered by the billing service specs; here it
    // settles the hold so the sweep's effect is visible in the table.
    service.closeExecution = async (executionId, organizationId) => {
      if (failingCloses.has(executionId)) {
        throw new Error('Unable to start a transaction');
      }
      for (const row of holds) {
        if (
          row.workloadId === executionId &&
          row.organizationId === organizationId
        ) {
          row.status = CreditReservationStatus.SETTLED;
        }
      }
    };
  });

  it('closes a terminal execution inside its own organization', async () => {
    holds = [hold('h1', 'exec-1', { organizationId: 'org-b' })];
    executions = [execution('exec-1', 'COMPLETED', 'org-b')];

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect(statusOf('h1')).toBe(CreditReservationStatus.SETTLED);
  });

  it.each([
    ['still running', hold('h1', 'exec-1'), execution('exec-1', 'RUNNING')],
    [
      'inside the grace period',
      hold('h1', 'exec-1', { createdAt: new Date('2026-10-26T09:55:00.000Z') }),
      execution('exec-1', 'COMPLETED'),
    ],
    [
      'owned by another organization',
      hold('h1', 'exec-1'),
      execution('exec-1', 'COMPLETED', 'org-b'),
    ],
    [
      'not a workflow hold',
      hold('h1', 'exec-1', { workloadType: 'image-generation' }),
      execution('exec-1', 'COMPLETED'),
    ],
  ])('leaves a hold that is %s reserved', async (_label, row, run) => {
    holds = [row];
    executions = [run];

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(0);

    expect(statusOf('h1')).toBe(CreditReservationStatus.RESERVED);
  });

  it('keeps closing the rest when one close fails', async () => {
    holds = [hold('h1', 'exec-1'), hold('h2', 'exec-2')];
    executions = [
      execution('exec-1', 'FAILED'),
      execution('exec-2', 'CANCELLED'),
    ];
    failingCloses.add('exec-1');

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect([statusOf('h1'), statusOf('h2')]).toEqual([
      CreditReservationStatus.RESERVED,
      CreditReservationStatus.SETTLED,
    ]);
    expect(errors).toEqual([
      {
        context: { executionId: 'exec-1', organizationId: 'org-a' },
        message: 'Workflow hold terminal close failed',
      },
    ]);
  });

  it('pages past a full page of running executions', async () => {
    const running = Array.from({ length: 100 }, (_, index) =>
      hold(`h${String(index).padStart(3, '0')}`, `running-${index}`),
    );
    holds = [...running, hold('h100', 'ended-1')];
    executions = [execution('ended-1', 'COMPLETED')];

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect(statusOf('h100')).toBe(CreditReservationStatus.SETTLED);
    expect(statusOf('h000')).toBe(CreditReservationStatus.RESERVED);
  });

  it('stops once the close limit is reached', async () => {
    holds = [hold('h1', 'e1'), hold('h2', 'e2')];
    executions = [execution('e1', 'COMPLETED'), execution('e2', 'COMPLETED')];

    await expect(service.reconcileTerminalExecutions(now, 1)).resolves.toBe(1);

    expect([statusOf('h1'), statusOf('h2')]).toEqual([
      CreditReservationStatus.SETTLED,
      CreditReservationStatus.RESERVED,
    ]);
  });

  it('closeTerminal logs a failed close and resolves so the caller continues', async () => {
    failingCloses.add('exec-1');

    await expect(
      service.closeTerminal('exec-1', 'org-a'),
    ).resolves.toBeUndefined();

    expect(errors).toEqual([
      {
        context: { executionId: 'exec-1', organizationId: 'org-a' },
        message: expect.stringContaining('billing close failed'),
      },
    ]);
  });
});
