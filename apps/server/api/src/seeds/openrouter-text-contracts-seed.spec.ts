import { findReviewedOpenRouterTextContract } from '@api/collections/models/utils/openrouter-text-contract.util';
import {
  prepareOpenRouterTextLine,
  validatePreparedOpenRouterTextLine,
} from '@api/helpers/utils/credits/openrouter-text-quote.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  buildOpenRouterTextSnapshot,
  OPENROUTER_TEXT_CONTRACT_REVIEWER,
  OPENROUTER_TEXT_CONTRACT_SEED,
  seedOpenRouterTextContracts,
} from '@api/seeds/openrouter-text-contracts-seed';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

const GEMINI = MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH;
const entry = OPENROUTER_TEXT_CONTRACT_SEED[0];

function harness(
  model: { id: string; reviewedProviderContractVersion: string | null } | null,
  current?: unknown,
) {
  const prisma = {
    model: {
      findFirst: vi.fn().mockResolvedValue(model),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    modelProviderContract: {
      findUnique: vi.fn().mockResolvedValue(current ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: prisma as unknown as PrismaService };
}

describe('seedOpenRouterTextContracts', () => {
  it('approves the Gemini 3.8 Flash tariff with the agreed ceilings', async () => {
    const h = harness({ id: 'model-1', reviewedProviderContractVersion: null });
    expect(await seedOpenRouterTextContracts(h.service)).toBe(1);
    const snapshot = buildOpenRouterTextSnapshot(entry, 'model-1');
    const version = quoteSnapshotHash(snapshot);
    expect(snapshot.endpoint).toBe(GEMINI);
    expect(snapshot.pricing).toMatchObject({
      completionUsdPerMillionCeiling: 4.125,
      inputUsdPerMillionCeiling: 0.825,
      kind: 'bounded',
      requestUsdCeiling: 0,
    });
    expect(h.prisma.modelProviderContract.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          modelId: 'model-1',
          reviewStatus: 'approved',
          reviewedBy: OPENROUTER_TEXT_CONTRACT_REVIEWER,
          version,
        }),
      }),
    );
    expect(h.prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reviewedProviderContractVersion: version },
      }),
    );
  });

  it('writes a contract the private text reader accepts', async () => {
    const h = harness({ id: 'model-1', reviewedProviderContractVersion: null });
    await seedOpenRouterTextContracts(h.service);
    const { create: stored } =
      h.prisma.modelProviderContract.upsert.mock.calls[0][0];
    // The reader selects only the descriptor columns; mirror its select.
    const {
      discoveredAt: _discovered,
      lastSeenAt: _seen,
      reviewedBy: _reviewer,
      ...create
    } = stored;
    const reader = {
      model: {
        findFirst: vi.fn().mockResolvedValue({
          endpoint: GEMINI,
          id: 'model-1',
          isActive: true,
          isDeleted: false,
          isFree: false,
          key: GEMINI,
          provider: 'openrouter',
          providerContracts: [create],
          reviewedProviderContractVersion: create.version,
        }),
      },
    } as unknown as PrismaService;
    const result = await findReviewedOpenRouterTextContract(reader, GEMINI);
    expect(result.status).toBe('reviewed');
  });

  it('turns the seeded tariff into a platform quote instead of PRICING_UNAVAILABLE', async () => {
    const h = harness({ id: 'model-1', reviewedProviderContractVersion: null });
    await seedOpenRouterTextContracts(h.service);
    const { create: stored } =
      h.prisma.modelProviderContract.upsert.mock.calls[0][0];
    const {
      discoveredAt: _discovered,
      lastSeenAt: _seen,
      reviewedBy: _reviewer,
      ...create
    } = stored;
    const reader = {
      model: {
        findFirst: vi.fn().mockResolvedValue({
          endpoint: GEMINI,
          id: 'model-1',
          isActive: true,
          isDeleted: false,
          isFree: false,
          key: GEMINI,
          provider: 'openrouter',
          providerContracts: [create],
          reviewedProviderContractVersion: create.version,
        }),
      },
    } as unknown as PrismaService;
    const result = await findReviewedOpenRouterTextContract(reader, GEMINI);
    if (result.status !== 'reviewed') throw new Error('contract not reviewed');

    const prepared = prepareOpenRouterTextLine({
      contract: result.contract,
      maximumOutputTokens: 2048,
      messages: [{ content: 'A synthetic post to enhance', role: 'user' }],
      route: { kind: 'platform' },
    });
    if (prepared.kind !== 'openrouter-text-platform-quote')
      throw new Error('expected a platform quote');
    // Full context ceiling in, capped completion out, no per-request fee.
    expect(prepared.maximumProviderCostUsd).toBeCloseTo(
      (1_048_576 * 0.825 + 2048 * 4.125) / 1_000_000,
      6,
    );
    expect(prepared.maximumCredits).toBeGreaterThan(0);
    expect(validatePreparedOpenRouterTextLine(prepared)).toEqual(prepared);
  });

  it('is idempotent once the pointer already carries the version', async () => {
    const version = quoteSnapshotHash(
      buildOpenRouterTextSnapshot(entry, 'model-1'),
    );
    const h = harness({
      id: 'model-1',
      reviewedProviderContractVersion: version,
    });
    expect(await seedOpenRouterTextContracts(h.service)).toBe(0);
    expect(h.prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(h.prisma.model.updateMany).not.toHaveBeenCalled();
  });

  it('skips a catalog without the platform model row', async () => {
    const h = harness(null);
    expect(await seedOpenRouterTextContracts(h.service)).toBe(0);
    expect(h.prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
  });

  it('keeps an operator approval made on or after the review date', async () => {
    const h = harness(
      { id: 'model-1', reviewedProviderContractVersion: 'operator-version' },
      {
        reviewedAt: new Date('2026-10-27T00:00:00.000Z'),
        reviewedBy: 'operator-1',
      },
    );
    expect(await seedOpenRouterTextContracts(h.service)).toBe(0);
    expect(h.prisma.model.updateMany).not.toHaveBeenCalled();
  });

  it('replaces an earlier operator approval or its own older contract', async () => {
    const older = harness(
      { id: 'model-1', reviewedProviderContractVersion: 'old' },
      {
        reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
        reviewedBy: 'operator-1',
      },
    );
    expect(await seedOpenRouterTextContracts(older.service)).toBe(1);
    const own = harness(
      { id: 'model-1', reviewedProviderContractVersion: 'old' },
      {
        reviewedAt: new Date('2026-12-01T00:00:00.000Z'),
        reviewedBy: OPENROUTER_TEXT_CONTRACT_REVIEWER,
      },
    );
    expect(await seedOpenRouterTextContracts(own.service)).toBe(1);
  });

  it('does not count a promotion that lost the compare-and-set', async () => {
    const h = harness({ id: 'model-1', reviewedProviderContractVersion: null });
    h.prisma.model.updateMany.mockResolvedValue({ count: 0 });
    expect(await seedOpenRouterTextContracts(h.service)).toBe(0);
  });
});
