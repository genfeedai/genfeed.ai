import {
  GENERATION_OUTPUT_TERMINAL_EVENT,
  type GenerationOutputTerminalEvent,
} from '@api/collections/credits/constants/generation-output-events.constants';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, IngredientStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-05T12:00:00.000Z');

interface IngredientRow {
  createdAt: Date;
  generationBilling: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: IngredientStatus;
}

function byokReceipt(overrides: Record<string, unknown> = {}) {
  return {
    amount: 4,
    description: 'Video generation',
    expiresAt: '2026-11-05T14:00:00.000Z',
    kind: 'byok',
    source: ActivitySource.VIDEO_GENERATION,
    state: 'pending',
    userId: 'user-1',
    ...overrides,
  };
}

const confirmedFailure = {
  ingredientId: 'video-1',
  kind: 'provider-terminal',
  observedAt: '2026-11-05T11:00:00.000Z',
  provider: 'heygen',
  version: 1,
};

/** An in-memory ingredient table with just the reads and writes the sweep makes. */
function createStore() {
  const rows = new Map<string, IngredientRow>();
  const byId = (where: { id: string; organizationId: string }) => {
    const row = rows.get(where.id);
    return row && row.organizationId === where.organizationId ? row : null;
  };
  const prisma = {
    $transaction: async (operation: (tx: unknown) => unknown) =>
      operation(prisma),
    creditReservation: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    creditTransaction: { findFirst: async () => null },
    crunGenerationTask: { findFirst: async () => null },
    ingredient: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => byId(where),
      findMany: async () =>
        [...rows.values()].filter(
          (row) => row.generationBilling.state === 'pending',
        ),
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<IngredientRow>;
        where: { id: string; organizationId: string };
      }) => {
        const row = byId(where);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { prisma, rows };
}

describe('GenerationBillingService BYOK reconciliation', () => {
  let store: ReturnType<typeof createStore>;
  let announced: GenerationOutputTerminalEvent[];
  let service: GenerationBillingService;

  beforeEach(() => {
    store = createStore();
    announced = [];
    const events = new EventEmitter2();
    events.on(GENERATION_OUTPUT_TERMINAL_EVENT, (event) => {
      announced.push(event);
    });
    service = new GenerationBillingService(
      {} as never,
      { queueByokUsage: vi.fn().mockResolvedValue(undefined) } as never,
      store.prisma as unknown as PrismaService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { reconcile: vi.fn().mockResolvedValue(0) } as never,
      undefined,
      { syncTerminal: vi.fn().mockResolvedValue(undefined) } as never,
      events,
    );
  });

  function storeVideo(
    status: IngredientStatus,
    receipt: Record<string, unknown>,
  ) {
    store.rows.set('video-1', {
      createdAt: new Date('2026-11-05T10:00:00.000Z'),
      generationBilling: receipt,
      id: 'video-1',
      isDeleted: false,
      organizationId: 'org-1',
      status,
    });
  }

  it('announces a confirmed provider failure while the ingredient still reads in progress, once', async () => {
    storeVideo(
      IngredientStatus.PROCESSING,
      byokReceipt({ confirmedFailure, submissionIntentProvider: 'heygen' }),
    );

    await service.reconcile(NOW);
    await service.reconcile(NOW);

    expect(announced).toEqual([
      {
        ingredientId: 'video-1',
        organizationId: 'org-1',
        outcome: 'released',
      },
    ]);
    expect(store.rows.get('video-1')?.generationBilling.state).toBe('failed');
  });

  it('keeps an unconfirmed provider outcome pending and silent', async () => {
    storeVideo(
      IngredientStatus.PROCESSING,
      byokReceipt({ submissionIntentProvider: 'heygen' }),
    );

    await service.reconcile(NOW);

    expect(announced).toEqual([]);
    expect(store.rows.get('video-1')?.generationBilling.state).toBe('pending');
  });

  it('announces a reconciled successful render as settled', async () => {
    storeVideo(IngredientStatus.GENERATED, byokReceipt());

    await service.reconcile(NOW);

    expect(announced).toEqual([
      {
        ingredientId: 'video-1',
        organizationId: 'org-1',
        outcome: 'settled',
      },
    ]);
  });
});
