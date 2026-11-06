import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import type { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IVisualCodeQuoteSnapshot,
  IVisualCodeReceipt,
  IVisualCodeSettings,
} from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface Hold {
  actorUserId: string;
  amount: number;
  expiresAt: Date;
  id: string;
  idempotencyKey: string;
  isDeleted: boolean;
  organizationId: string;
  status: string;
  workloadId: string;
  workloadType: string;
}

interface StoredRevision {
  brandId: string;
  consumedCredits: number;
  id: string;
  isDeleted: boolean;
  maximumCredits: number;
  organizationId: string;
  projectId: string;
  receipts: IVisualCodeReceipt[];
  reservationId: string | null;
  userId: string;
}

const MODEL = 'openai/test';
const SETTINGS: IVisualCodeSettings = {
  durationFrames: 30,
  fps: 30,
  height: 360,
  width: 640,
};
const IN_AN_HOUR = new Date(Date.now() + 3_600_000);

// Prisma filters as Postgres applies them: JSON `equals` compares the stored document.
const matches = (row: object, where: Row) =>
  Object.entries(where).every(([key, condition]) => {
    const value = (row as Row)[key];
    if (condition && typeof condition === 'object' && 'equals' in condition) {
      return JSON.stringify(value) === JSON.stringify(condition.equals);
    }
    return value === condition;
  });

const receipt = (fields: Partial<IVisualCodeReceipt>) =>
  ({
    boundCredits: 0,
    credits: 0,
    isResultApplied: false,
    operatorCredits: 0,
    state: 'started',
    ...fields,
  }) as IVisualCodeReceipt;

describe('VisualProjectBillingService', () => {
  // The pricing world the quote is computed from.
  let route: { isAvailable: boolean; isByok: boolean; provider: string };
  let price: { completionPerMillion: number; promptPerMillion: number };
  // The wallet: holds and what was settled or released against them.
  let holds: Hold[];
  let settlements: { actualAmount: number; reservationId: string }[];
  let releases: string[];
  let walletFailures: number;
  let isReservationLookupDown: boolean;
  // The renderer's receipts for renders that were running when work stopped.
  let stoppedRenders: Map<string, Row>;
  let recoveredRenders: string[];
  // The stored revision row.
  let stored: StoredRevision;
  let snapshot: IVisualCodeQuoteSnapshot;
  let service: VisualProjectBillingService;

  const read = () => structuredClone(stored) as unknown as VisualRevision;
  const receiptOf = (id: string) =>
    stored.receipts.find((entry) => entry.id === id);
  const hasSettlementMarker = () =>
    stored.receipts.some((entry) => entry.kind === 'settlement');
  const seedHold = (fields: Partial<Hold> = {}) => {
    holds = [
      {
        actorUserId: 'user',
        amount: stored.maximumCredits,
        expiresAt: IN_AN_HOUR,
        id: 'hold',
        idempotencyKey: 'visual-code-revision',
        isDeleted: false,
        organizationId: 'org',
        status: 'RESERVED',
        workloadId: 'revision',
        workloadType: 'visual-code',
        ...fields,
      },
    ];
  };

  beforeEach(async () => {
    route = { isAvailable: true, isByok: false, provider: 'openai' };
    price = { completionPerMillion: 2, promptPerMillion: 1 };
    holds = [];
    settlements = [];
    releases = [];
    walletFailures = 0;
    isReservationLookupDown = false;
    stoppedRenders = new Map();
    recoveredRenders = [];

    const prisma = {
      creditReservation: {
        findFirst: async ({ where }: { where: Row }) => {
          if (isReservationLookupDown) throw new Error('database unavailable');
          return holds.find((hold) => matches(hold, where)) ?? null;
        },
      },
      model: {
        findMany: async () => [
          {
            capabilities: ['vision'],
            id: 'model-1',
            key: MODEL,
            recommendedFor: [],
            supportsFeatures: [],
          },
        ],
      },
      organization: { findFirst: async () => ({ id: 'org' }) },
      organizationSetting: { findFirst: async () => null },
      visualRevision: {
        findFirstOrThrow: async ({ where }: { where: Row }) => {
          if (!matches(stored, where))
            throw new Error('No VisualRevision found');
          return read();
        },
        updateMany: async ({ data, where }: { data: Row; where: Row }) => {
          if (!matches(stored, where)) return { count: 0 };
          Object.assign(stored, structuredClone(data));
          return { count: 1 };
        },
      },
    };
    const credits = {
      releaseReservation: async ({
        reservationId,
      }: {
        reservationId: string;
      }) => {
        releases.push(reservationId);
        Object.assign(holds.find((hold) => hold.id === reservationId) ?? {}, {
          status: 'RELEASED',
        });
      },
      reserveCredits: async (
        input: Omit<Hold, 'expiresAt' | 'id' | 'isDeleted' | 'status'>,
      ) => {
        const existing = holds.find(
          (hold) => hold.idempotencyKey === input.idempotencyKey,
        );
        if (existing) return existing;
        const hold: Hold = {
          ...input,
          expiresAt: IN_AN_HOUR,
          id: `reserved-${holds.length + 1}`,
          isDeleted: false,
          status: 'RESERVED',
        };
        holds.push(hold);
        return hold;
      },
      settleReservation: async (input: {
        actualAmount: number;
        reservationId: string;
      }) => {
        if (walletFailures > 0) {
          walletFailures -= 1;
          throw new Error('wallet unavailable');
        }
        settlements.push({
          actualAmount: input.actualAmount,
          reservationId: input.reservationId,
        });
      },
    };
    const registry = {
      getDefaultModelKey: async () => MODEL,
      listSelectable: async () => [
        { key: MODEL, label: 'Test', pricing: price, provider: 'openai' },
      ],
      toRoundCredits: (usd: number) => Math.ceil(usd),
    };
    service = new VisualProjectBillingService(
      prisma as unknown as PrismaService,
      credits as unknown as CreditsUtilsService,
      registry as unknown as AgentChatModelRegistryService,
      {
        enforceModel: async (_organizationId: string, key: string) => key,
      } as unknown as AgentModelAccessService,
      {
        getCompletionRoute: async () => ({ ...route }),
      } as unknown as LlmDispatcherService,
      {
        availability: async () => ({
          creditsPerSecond: 1 / 240,
          isAvailable: true,
        }),
        recoverStopped: async (id: string) => {
          recoveredRenders.push(id);
          return stoppedRenders.get(id) ?? null;
        },
      } as unknown as VisualProjectRendererClientService,
    );

    snapshot = await service.quote('org', MODEL, true, SETTINGS, [
      { format: 'mp4' },
    ]);
    stored = {
      brandId: 'brand',
      consumedCredits: 2,
      id: 'revision',
      isDeleted: false,
      maximumCredits: snapshot.maximumCredits,
      organizationId: 'org',
      projectId: 'project',
      receipts: [service.quoteReceipt(snapshot)],
      reservationId: 'hold',
      userId: 'user',
    };
    seedHold();
  });

  describe('quote', () => {
    it('bounds authoring, inspection and rendering at the model and renderer prices', () => {
      expect(snapshot).toMatchObject({
        authoringCredits: 3,
        creditsPerSecond: 1 / 240,
        inspectionCredits: 3,
        isByok: false,
        maximumCredits: 8,
        modelKey: MODEL,
        provider: 'openai',
        renderCredits: 2,
      });
    });

    it('charges nothing for model calls on a BYOK route but still bounds rendering', async () => {
      route.isByok = true;

      expect(
        await service.quote('org', MODEL, true, SETTINGS, [{ format: 'mp4' }]),
      ).toMatchObject({
        authoringCredits: 0,
        inputCostPerMillion: 0,
        inspectionCredits: 0,
        maximumCredits: 2,
        renderCredits: 2,
      });
    });
  });

  describe('validateSnapshot', () => {
    it('accepts an unchanged quote backed by its live hold', async () => {
      await expect(service.validateSnapshot(read())).resolves.toEqual(snapshot);
    });

    it.each([
      [
        'the route turns BYOK',
        () => {
          route.isByok = true;
        },
      ],
      [
        'the input price changes',
        () => {
          price.promptPerMillion = 2;
        },
      ],
    ])(
      'rejects the quote when %s, even with spare credits under the ceiling',
      async (_case, change) => {
        change();

        await expect(service.validateSnapshot(read())).rejects.toThrow(
          'quote_changed',
        );
      },
    );

    it.each([
      ['a released hold', { status: 'RELEASED' }],
      ['an expired hold', { status: 'EXPIRED' }],
      ['a settled hold', { status: 'SETTLED' }],
      ['a hold past its expiry', { expiresAt: new Date(0) }],
      ['a hold for a different amount', { amount: 5 }],
    ])('refuses new paid work with %s', async (_case, fields) => {
      seedHold(fields);

      await expect(service.validateSnapshot(read())).rejects.toThrow(
        'visual_reservation_unavailable',
      );
      expect(holds).toHaveLength(1);
    });

    it('skips every hold read for a free quote', async () => {
      stored.receipts = [
        service.quoteReceipt({ ...snapshot, maximumCredits: 0 }),
      ];
      isReservationLookupDown = true;

      await expect(service.validateSnapshot(read())).resolves.toMatchObject({
        maximumCredits: 0,
      });
    });
  });

  describe('settle', () => {
    it('settles consumed work once and records the marker only after the wallet succeeds', async () => {
      walletFailures = 1;

      await expect(service.settle(read())).rejects.toThrow(
        'wallet unavailable',
      );
      expect(hasSettlementMarker()).toBe(false);

      await service.settle(read());
      await service.settle(read());

      expect(settlements).toEqual([{ actualAmount: 2, reservationId: 'hold' }]);
      expect(hasSettlementMarker()).toBe(true);
    });

    it('releases an unused hold without a debit', async () => {
      stored.consumedCredits = 0;

      await service.settle(read());

      expect(releases).toEqual(['hold']);
      expect(settlements).toEqual([]);
    });

    it('never touches the wallet for zero-cost work and still settles durably', async () => {
      stored.receipts = [
        service.quoteReceipt({ ...snapshot, maximumCredits: 0 }),
      ];
      Object.assign(stored, {
        consumedCredits: 0,
        maximumCredits: 50,
        reservationId: null,
      });
      holds = [];

      await expect(service.reserve(read())).resolves.toBeNull();
      await service.settle(read());
      await service.settle(read());

      expect(holds).toEqual([]);
      expect(settlements).toEqual([]);
      expect(releases).toEqual([]);
      expect(hasSettlementMarker()).toBe(true);
    });

    it.each(['RELEASED', 'EXPIRED'])(
      'assigns confirmed work to the operator when the call outlived a %s hold',
      async (status) => {
        stored.receipts.push(
          receipt({
            boundCredits: 2,
            credits: 2,
            id: 'inspection',
            isResultApplied: true,
            kind: 'inspection',
            operatorCredits: 1,
            providerCost: 0.1,
            state: 'confirmed',
          } as Partial<IVisualCodeReceipt>),
        );
        seedHold({ expiresAt: new Date(0), status });

        await service.settle(read());
        await service.settle(read());

        expect(stored.consumedCredits).toBe(0);
        expect(receiptOf('inspection')).toMatchObject({
          credits: 0,
          operatorCredits: 3,
          providerCost: 0.1,
        });
        expect(releases).toEqual(['hold']);
        expect(settlements).toEqual([]);
        expect(holds).toHaveLength(1);
      },
    );

    it('keeps a missing paid hold recoverable without a false marker', async () => {
      holds = [];

      await expect(service.settle(read())).rejects.toThrow(
        'visual_reservation_unavailable',
      );
      expect(settlements).toEqual([]);
      expect(releases).toEqual([]);
      expect(hasSettlementMarker()).toBe(false);
    });

    it('preserves already settled user costs during marker recovery', async () => {
      seedHold({ expiresAt: new Date(0), status: 'SETTLED' });

      await service.settle(read());

      expect(stored.consumedCredits).toBe(2);
      expect(settlements).toEqual([{ actualAmount: 2, reservationId: 'hold' }]);
      expect(releases).toEqual([]);
    });
  });

  describe('reconcileStopped', () => {
    it('recovers a hold whose reservation write did not persist, then releases it', async () => {
      stored.reservationId = null;

      await service.reconcileStopped(read());

      expect(stored.reservationId).toBe('hold');
      expect(releases).toEqual(['hold']);
      expect(hasSettlementMarker()).toBe(true);
    });

    it('never marks settled while the hold lookup is failing', async () => {
      stored.reservationId = null;
      isReservationLookupDown = true;

      await expect(service.reconcileStopped(read())).rejects.toThrow(
        'database unavailable',
      );
      expect(releases).toEqual([]);
      expect(hasSettlementMarker()).toBe(false);
    });

    it('records crashed provider liability without charging an unconfirmed call', async () => {
      stored.receipts.push(
        receipt({ boundCredits: 3, id: 'author-1', kind: 'authoring' }),
      );

      await service.reconcileStopped(read());

      expect(receiptOf('author-1')).toMatchObject({
        credits: 0,
        operatorCredits: 3,
        state: 'indeterminate',
      });
      expect(settlements).toEqual([]);
      expect(releases).toEqual(['hold']);
    });

    it('settles trusted recovered render compute without submitting a replacement render', async () => {
      stored.receipts.push(
        receipt({ boundCredits: 0.5, id: 'render-1', kind: 'render' }),
      );
      stoppedRenders.set('render-1', {
        computeSeconds: 120,
        isComputeIndeterminate: false,
      });

      await service.reconcileStopped(read());

      expect(recoveredRenders).toEqual(['render-1']);
      expect(receiptOf('render-1')).toMatchObject({
        computeSeconds: 120,
        credits: 0.5,
        state: 'confirmed',
      });
      expect(settlements).toEqual([
        { actualAmount: 0.5, reservationId: 'hold' },
      ]);
    });

    it('uses the original idempotent wallet reservation as the uncertain admission barrier', async () => {
      stored.reservationId = null;
      stored.receipts.push(receipt({ id: 'admission-1', kind: 'admission' }));
      holds = [];

      await service.reconcileStopped(read());

      expect(holds).toEqual([
        expect.objectContaining({
          actorUserId: 'user',
          amount: snapshot.maximumCredits,
          id: 'reserved-1',
          idempotencyKey: 'visual-code-revision',
          organizationId: 'org',
        }),
      ]);
      expect(stored.reservationId).toBe('reserved-1');
      expect(releases).toEqual(['reserved-1']);
      expect(receiptOf('admission-1')).toMatchObject({
        credits: 0,
        operatorCredits: 0,
        state: 'confirmed',
      });
    });
  });
});
