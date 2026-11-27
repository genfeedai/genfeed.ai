import { randomUUID } from 'node:crypto';
import { AdDialogueVerificationService } from '@api/services/ad-dialogue-verification/ad-dialogue-verification.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

const SCRIPT = 'Try this serum today. It changed my skin in 7 days.';
const srt = (text: string) => `1\n00:00:00,000 --> 00:00:05,000\n${text}\n`;

/**
 * The dialogue check of an ad preset output (#7927) against real Prisma and
 * PostgreSQL. Transcription is a stub: no live provider call is made.
 */
describe.skipIf(!connectionString)(
  'AdDialogueVerificationService PostgreSQL (#7927)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID().slice(0, 8);
    const id = (name: string) => `ad-dialogue-${name}-${suffix}`;
    const userId = id('user');
    const orgA = id('org-a');
    const orgB = id('org-b');
    const brandA = id('brand-a');
    const clean = id('clean');
    const drifted = id('drifted');
    const spokenRaw = id('spoken-raw');
    const unplanned = id('unplanned');
    const down = id('down');
    const trashed = id('trashed');
    const checked = id('checked');
    const transcripts = new Map<string, string | Error>();
    let transcriptions = 0;
    let service: AdDialogueVerificationService;

    const harness = (adDialogue?: Record<string, string>) =>
      toPrismaJson({
        enhancedPrompt: 'prompt',
        originalPrompt: 'prompt',
        status: 'skipped',
        ...(adDialogue ? { adDialogue } : {}),
      });
    const stored = async (ingredientId: string) =>
      (
        await database().ingredient.findFirstOrThrow({
          select: { generationHarness: true },
          where: { id: ingredientId },
        })
      ).generationHarness as { adDialogue?: Record<string, unknown> };

    beforeAll(async () => {
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.createMany({
        data: [orgA, orgB].map((orgId) => ({
          id: orgId,
          label: orgId,
          slug: orgId,
          userId,
        })),
      });
      await db.brand.create({
        data: {
          id: brandA,
          label: brandA,
          organizationId: orgA,
          slug: brandA,
          userId,
        },
      });
      const base = {
        brandId: brandA,
        category: IngredientCategory.VIDEO,
        organizationId: orgA,
        status: IngredientStatus.GENERATED,
        userId,
      };
      const pending = { script: SCRIPT, status: 'pending' };
      await db.ingredient.createMany({
        data: [
          { ...base, generationHarness: harness(pending), id: clean },
          { ...base, generationHarness: harness(pending), id: drifted },
          { ...base, generationHarness: harness(pending), id: spokenRaw },
          { ...base, generationHarness: harness(), id: unplanned },
          { ...base, generationHarness: harness(pending), id: down },
          {
            ...base,
            generationHarness: harness(pending),
            id: trashed,
            isDeleted: true,
          },
          {
            ...base,
            generationHarness: harness({
              checkedAt: '2026-11-26T00:00:00.000Z',
              script: SCRIPT,
              status: 'matched',
            }),
            id: checked,
          },
        ],
      });
      transcripts.set(
        clean,
        srt('try this serum today it changed my skin in seven days'),
      );
      transcripts.set(
        drifted,
        srt('try this cream tomorrow it changed my face in nine weeks'),
      );
      transcripts.set(
        spokenRaw,
        srt('Try this serum today. It changed my skin.'),
      );
      transcripts.set(down, new Error('provider unavailable'));
      const whisper = {
        generateCaptions: async (ingredientId: string) => {
          transcriptions += 1;
          const transcript = transcripts.get(ingredientId);
          if (transcript === undefined || transcript instanceof Error)
            throw transcript ?? new Error('no transcript');
          return transcript;
        },
      } as unknown as WhisperService;
      const ledger = {
        record: async () => undefined,
      } as unknown as MediaVendorCostLedgerService;
      const logger = {
        error: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService;
      service = new AdDialogueVerificationService(
        db as unknown as PrismaService,
        whisper,
        ledger,
        logger,
      );
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.ingredient.deleteMany({ where: { userId } });
      await prisma.brand.deleteMany({ where: { userId } });
      await prisma.organization.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it('marks a take that says the script, numbers as words included, as matched', async () => {
      await service.verify(orgA, clean);
      expect((await stored(clean)).adDialogue).toMatchObject({
        added: [],
        changed: [],
        removed: [],
        script: SCRIPT,
        status: 'matched',
        wordErrorRate: 0,
      });
    });

    it('holds a drifted take for review with the diff', async () => {
      await service.verify(orgA, drifted);
      const { adDialogue } = await stored(drifted);
      expect(adDialogue).toMatchObject({ status: 'needs_review' });
      expect(adDialogue?.changed).toEqual([
        { actual: 'cream', expected: 'serum' },
        { actual: 'tomorrow', expected: 'today' },
        { actual: 'face', expected: 'skin' },
        { actual: '9', expected: '7' },
        { actual: 'weeks', expected: 'days' },
      ]);
    });

    it('holds a take that dropped words', async () => {
      await service.verify(orgA, spokenRaw);
      const { adDialogue } = await stored(spokenRaw);
      expect(adDialogue).toMatchObject({
        removed: ['in', '7', 'days'],
        status: 'needs_review',
      });
    });

    it('records that a check could not run without failing the generation', async () => {
      await service.verify(orgA, down);
      expect((await stored(down)).adDialogue).toEqual({
        reasonCode: 'transcription_unavailable',
        script: SCRIPT,
        status: 'not_checked',
      });
    });

    it('leaves outputs with no pending check, other tenants and trashed rows alone', async () => {
      const before = transcriptions;
      await service.verify(orgA, unplanned);
      await service.verify(orgA, checked);
      await service.verify(orgB, id('pending-in-other-org'));
      await service.verify(orgB, spokenRaw);
      await service.verify(orgA, trashed);
      expect(transcriptions).toBe(before);
      expect((await stored(unplanned)).adDialogue).toBeUndefined();
      expect((await stored(checked)).adDialogue).toMatchObject({
        status: 'matched',
      });
      expect((await stored(trashed)).adDialogue).toMatchObject({
        status: 'pending',
      });
    });
  },
);
