/**
 * BrandInterviewService unit tests.
 *
 * All Prisma delegates and external services are mocked so no DB or Redis is needed.
 */

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandInterviewService } from '@api/collections/brands/brand-interview/services/brand-interview.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BRAND_INTERVIEW_CREDIT_COST,
  IN_SCOPE_FIELD_KEYS,
} from '../constants/brand-interview-question-catalog.constant';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function makeSession(
  overrides: Partial<{
    id: string;
    brandId: string;
    organizationId: string;
    userId: string;
    status: string;
    answeredFields: Record<string, unknown>;
    askedFieldKeys: string[];
    currentFieldKey: string | null;
    completenessBefore: number;
    completenessAfter: number | null;
    creditsCharged: number;
    isDeleted: boolean;
  }> = {},
) {
  return {
    id: 'interview-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    status: 'in_progress',
    answeredFields: {},
    askedFieldKeys: [],
    currentFieldKey: 'description',
    completenessBefore: 0,
    completenessAfter: null,
    creditsCharged: BRAND_INTERVIEW_CREDIT_COST,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEmptyBrand(agentConfig: Record<string, unknown> = {}) {
  return {
    id: 'brand-1',
    organizationId: 'org-1',
    label: 'Test Brand',
    description: null,
    text: null,
    agentConfig,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

describe('BrandInterviewService', () => {
  let service: BrandInterviewService;
  let brandDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let interviewDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let creditsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let cacheService: { invalidate: ReturnType<typeof vi.fn> };
  let logger: LoggerService;

  beforeEach(() => {
    brandDelegate = {
      findFirst: vi.fn(),
      update: vi.fn(),
    };
    interviewDelegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    };
    creditsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
    };
    cacheService = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    logger = makeLogger();

    const prisma = {
      brand: brandDelegate,
      brandInterview: interviewDelegate,
    } as unknown as PrismaService;

    service = new BrandInterviewService(
      prisma,
      creditsService as unknown as CreditsUtilsService,
      cacheService as unknown as CacheInvalidationService,
      logger,
    );
  });

  // ── start() ───────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('charges credits once for a new session', async () => {
      const session = makeSession();
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst.mockResolvedValue(null); // no existing session
      interviewDelegate.create.mockResolvedValue(session);

      const result = await service.start('brand-1', 'org-1', 'user-1');

      expect(
        creditsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledOnce();
      expect(creditsService.deductCreditsFromOrganization).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        BRAND_INTERVIEW_CREDIT_COST,
        'Brand context interview',
        expect.any(String), // ActivitySource.BRAND_INTERVIEW
      );
      expect(result.interviewId).toBe('interview-1');
      expect(result.creditsCharged).toBe(BRAND_INTERVIEW_CREDIT_COST);
    });

    it('returns existing session without re-charging (idempotent)', async () => {
      const existingSession = makeSession({ id: 'existing-123' });
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst.mockResolvedValue(existingSession); // existing session found

      const result = await service.start('brand-1', 'org-1', 'user-1');

      expect(
        creditsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(
        creditsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(result.interviewId).toBe('existing-123');
      expect(result.creditsCharged).toBe(0); // no charge on re-entry
    });

    it('handles P2002 unique violation on concurrent start — returns active session without charging', async () => {
      const raceSession = makeSession({ id: 'race-session' });
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst
        .mockResolvedValueOnce(null) // first check: no existing
        .mockResolvedValueOnce(raceSession); // second check after P2002

      const p2002 = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      interviewDelegate.create.mockRejectedValue(p2002);

      const result = await service.start('brand-1', 'org-1', 'user-1');

      expect(
        creditsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(result.interviewId).toBe('race-session');
      expect(result.creditsCharged).toBe(0);
    });

    it('throws InsufficientCreditsException when balance is too low', async () => {
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst.mockResolvedValue(null);
      creditsService.checkOrganizationCreditsAvailable.mockResolvedValue(false);
      creditsService.getOrganizationCreditsBalance.mockResolvedValue(3);

      await expect(
        service.start('brand-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);

      expect(interviewDelegate.create).not.toHaveBeenCalled();
    });

    it('compensates (soft-abandons session) when deduct throws', async () => {
      const session = makeSession();
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst.mockResolvedValue(null);
      interviewDelegate.create.mockResolvedValue(session);
      creditsService.deductCreditsFromOrganization.mockRejectedValue(
        new Error('deduct failed'),
      );
      interviewDelegate.update.mockResolvedValue({
        ...session,
        isDeleted: true,
        status: 'abandoned',
      });

      await expect(service.start('brand-1', 'org-1', 'user-1')).rejects.toThrow(
        'deduct failed',
      );

      expect(interviewDelegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true, status: 'abandoned' },
        where: { id: session.id },
      });
    });

    it('OSS no-op path (deduct resolves) still returns a session', async () => {
      const session = makeSession();
      brandDelegate.findFirst.mockResolvedValue(makeEmptyBrand());
      interviewDelegate.findFirst.mockResolvedValue(null);
      interviewDelegate.create.mockResolvedValue(session);
      // OSS: deduct always resolves without side effects
      creditsService.deductCreditsFromOrganization.mockResolvedValue(undefined);

      const result = await service.start('brand-1', 'org-1', 'user-1');

      expect(result.interviewId).toBe('interview-1');
      expect(result.creditsCharged).toBe(BRAND_INTERVIEW_CREDIT_COST);
    });

    it('throws NotFoundException when brand does not exist', async () => {
      brandDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.start('nonexistent', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── writeFieldToBrand (tested via submitAnswer) ────────────────────────────

  describe('submitAnswer() — field writes', () => {
    it('writes identity field directly to brand row (description)', async () => {
      const session = makeSession({ currentFieldKey: 'description' });
      const emptyBrand = makeEmptyBrand();
      const filledBrand = { ...emptyBrand, description: 'My brand does X.' };

      interviewDelegate.findFirst.mockResolvedValue(session);
      brandDelegate.findFirst.mockResolvedValueOnce(filledBrand); // reload after write
      brandDelegate.update.mockResolvedValue(filledBrand);
      interviewDelegate.update.mockResolvedValue({
        ...session,
        answeredFields: { description: 'My brand does X.' },
        currentFieldKey: 'text',
      });

      await service.submitAnswer(
        'interview-1',
        'org-1',
        'user-1',
        'My brand does X.',
      );

      expect(brandDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'My brand does X.' }),
        }),
      );
    });

    it('deep-merges agentConfig — preserves sibling voice fields', async () => {
      // Pre-existing: voice.tone = 'Bold' already set
      const agentConfig = { voice: { tone: 'Bold' } };
      const session = makeSession({
        currentFieldKey: 'style',
        answeredFields: { tone: 'Bold' },
      });
      const brandWithTone = makeEmptyBrand(agentConfig);

      // After write the brand has both tone and style
      const brandAfterWrite = makeEmptyBrand({
        voice: { style: 'Punchy sentences', tone: 'Bold' },
      });

      interviewDelegate.findFirst.mockResolvedValue(session);
      brandDelegate.findFirst
        .mockResolvedValueOnce(brandWithTone) // read for agentConfig merge
        .mockResolvedValueOnce(brandAfterWrite); // reload after write for completeness
      brandDelegate.update.mockResolvedValue(brandAfterWrite);
      interviewDelegate.update.mockResolvedValue({
        ...session,
        answeredFields: { style: 'Punchy sentences', tone: 'Bold' },
        currentFieldKey: 'audience',
      });

      await service.submitAnswer(
        'interview-1',
        'org-1',
        'user-1',
        'Punchy sentences',
      );

      // The update call must preserve tone as well as writing style
      const updateCall = brandDelegate.update.mock.calls[0][0];
      const writtenCfg = updateCall.data.agentConfig as Record<string, unknown>;
      const voiceGrp = writtenCfg.voice as Record<string, unknown>;
      expect(voiceGrp.tone).toBe('Bold');
      expect(voiceGrp.style).toBe('Punchy sentences');
    });

    it('advances to next in-scope gap after answering', async () => {
      // Only description is answered; next should be 'text'
      const session = makeSession({ currentFieldKey: 'description' });
      // Brand after write: description set but text still empty
      const updatedBrand = makeEmptyBrand();
      Object.assign(updatedBrand, { description: 'Test' });

      interviewDelegate.findFirst.mockResolvedValue(session);
      brandDelegate.findFirst.mockResolvedValue(updatedBrand);
      brandDelegate.update.mockResolvedValue(updatedBrand);
      interviewDelegate.update.mockImplementation((args) =>
        Promise.resolve({ ...session, ...args.data }),
      );

      const result = await service.submitAnswer(
        'interview-1',
        'org-1',
        'user-1',
        'Test',
      );

      // Next question should be 'text' (next in catalog after 'description')
      expect(result.nextQuestion?.fieldKey).toBe('text');
      expect(result.isComplete).toBe(false);
    });

    it('marks session completed when all in-scope fields are answered', async () => {
      // Simulate a brand that has ALL in-scope fields filled (completeness returns no incomplete)
      const fullyFilledBrand = makeEmptyBrand({
        strategy: {
          contentTypes: ['posts'],
          frequency: 'daily',
          goals: ['growth'],
          platforms: ['LinkedIn'],
        },
        voice: {
          audience: ['founders'],
          doNotSoundLike: ['corporate'],
          messagingPillars: ['simplicity'],
          sampleOutput: 'Example text.',
          style: 'Direct',
          tone: 'Bold',
          values: ['transparency'],
        },
      });
      Object.assign(fullyFilledBrand, {
        description: 'We help brands.',
        text: 'You are Acme...',
      });

      // Session that just answered the last field
      const session = makeSession({
        answeredFields: Object.fromEntries(
          IN_SCOPE_FIELD_KEYS.map((k) => [k, 'answered']),
        ),
        currentFieldKey: 'frequency',
      });

      interviewDelegate.findFirst.mockResolvedValue({
        ...session,
        answeredFields: Object.fromEntries(
          IN_SCOPE_FIELD_KEYS.filter((k) => k !== 'frequency').map((k) => [
            k,
            'answered',
          ]),
        ),
        currentFieldKey: 'frequency',
      });
      brandDelegate.findFirst.mockResolvedValue(fullyFilledBrand);
      brandDelegate.update.mockResolvedValue(fullyFilledBrand);
      interviewDelegate.update.mockImplementation((args) =>
        Promise.resolve({ ...session, ...args.data }),
      );

      const result = await service.submitAnswer(
        'interview-1',
        'org-1',
        'user-1',
        'daily',
      );

      expect(result.isComplete).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.nextQuestion).toBeNull();
    });
  });

  // ── skipField() ────────────────────────────────────────────────────────────

  describe('skipField()', () => {
    it('advances to next in-scope gap without writing to brand', async () => {
      const session = makeSession({ currentFieldKey: 'description' });
      const emptyBrand = makeEmptyBrand();

      interviewDelegate.findFirst.mockResolvedValue(session);
      brandDelegate.findFirst.mockResolvedValue(emptyBrand);
      interviewDelegate.update.mockImplementation((args) =>
        Promise.resolve({ ...session, ...args.data }),
      );

      const result = await service.skipField('interview-1', 'org-1');

      // Brand must NOT be written
      expect(brandDelegate.update).not.toHaveBeenCalled();
      // Next question should be 'text' (next in catalog after description)
      expect(result.nextQuestion?.fieldKey).toBe('text');
      expect(result.isComplete).toBe(false);
    });

    it('completes when no more non-skipped gaps remain', async () => {
      // All fields skipped except one, and that one is being skipped now
      const askedFieldKeys = IN_SCOPE_FIELD_KEYS.filter(
        (k) => k !== 'frequency',
      );
      const session = makeSession({
        askedFieldKeys,
        currentFieldKey: 'frequency',
      });
      const emptyBrand = makeEmptyBrand();

      interviewDelegate.findFirst.mockResolvedValue(session);
      brandDelegate.findFirst.mockResolvedValue(emptyBrand);
      interviewDelegate.update.mockImplementation((args) =>
        Promise.resolve({ ...session, ...args.data }),
      );

      const result = await service.skipField('interview-1', 'org-1');

      expect(result.isComplete).toBe(true);
      expect(result.status).toBe('completed');
    });
  });

  // ── getCompleteness() ──────────────────────────────────────────────────────

  describe('getCompleteness()', () => {
    it('excludes visual fields from interviewableGapCount', async () => {
      // An empty brand: all fields including visual are incomplete
      // computeBrandCompleteness will return label (always set), logo, primaryColor as missing
      // but those should NOT be in interviewableGapCount
      const emptyBrand = makeEmptyBrand();
      brandDelegate.findFirst.mockResolvedValue(emptyBrand);

      const result = await service.getCompleteness('brand-1', 'org-1');

      // Only the 13 in-scope keys should appear in incompleteFieldKeys
      const unexpectedKeys = result.incompleteFieldKeys.filter(
        (k) => !IN_SCOPE_FIELD_KEYS.includes(k),
      );
      expect(unexpectedKeys).toHaveLength(0);
      // All 13 in-scope fields should be incomplete for an empty brand
      expect(result.interviewableGapCount).toBe(IN_SCOPE_FIELD_KEYS.length);
    });
  });

  // ── getActiveForBrand() ────────────────────────────────────────────────────

  describe('getActiveForBrand()', () => {
    it('returns null when no active session exists', async () => {
      interviewDelegate.findFirst.mockResolvedValue(null);

      const result = await service.getActiveForBrand('brand-1', 'org-1');

      expect(result).toBeNull();
    });

    it('maps currentFieldKey → currentQuestion and completenessBefore → completenessScore', async () => {
      const session = makeSession({
        currentFieldKey: 'description',
        completenessBefore: 42,
        answeredFields: { tone: 'Bold' },
      });
      interviewDelegate.findFirst.mockResolvedValue(session);

      const result = await service.getActiveForBrand('brand-1', 'org-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('interview-1');
      expect(result!.status).toBe('in_progress');
      // currentFieldKey 'description' must resolve to a question object
      expect(result!.currentQuestion).not.toBeNull();
      expect(result!.currentQuestion?.fieldKey).toBe('description');
      // completenessBefore must surface as completenessScore
      expect(result!.completenessScore).toBe(42);
      // answeredCount reflects answered fields in session
      expect(result!.answeredCount).toBe(1);
      expect(result!.totalCount).toBe(IN_SCOPE_FIELD_KEYS.length);
    });

    it('sets currentQuestion to null when currentFieldKey is null', async () => {
      const session = makeSession({ currentFieldKey: null });
      interviewDelegate.findFirst.mockResolvedValue(session);

      const result = await service.getActiveForBrand('brand-1', 'org-1');

      expect(result!.currentQuestion).toBeNull();
    });
  });

  // ── abandon() ─────────────────────────────────────────────────────────────

  describe('abandon()', () => {
    it('marks session as abandoned', async () => {
      const session = makeSession();
      interviewDelegate.findFirst.mockResolvedValue(session);
      interviewDelegate.update.mockResolvedValue({
        ...session,
        status: 'abandoned',
      });

      await service.abandon('interview-1', 'org-1');

      expect(interviewDelegate.update).toHaveBeenCalledWith({
        data: { status: 'abandoned' },
        where: { id: 'interview-1' },
      });
    });

    it('throws BadRequestException when session is already completed', async () => {
      interviewDelegate.findFirst.mockResolvedValue(
        makeSession({ status: 'completed' }),
      );

      await expect(
        service.abandon('interview-1', 'org-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
