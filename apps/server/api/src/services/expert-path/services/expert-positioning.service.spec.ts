import type { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { HarnessProfileDocument } from '@api/collections/harness-profiles/schemas/harness-profile.schema';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ExpertPositioningService } from '@api/services/expert-path/services/expert-positioning.service';
import { buildExpertHarnessDraft } from '@api/services/expert-path/utils/expert-harness-draft.util';
import { scoreExpertPositioning } from '@api/services/expert-path/utils/expert-positioning-score.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ExpertPositioningAnswers } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function makeTypedEntry(overrides: {
  type: string;
  content: string;
  updatedAt?: Date;
}) {
  return {
    brandId: 'brand-1',
    content: overrides.content,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: `memory-${overrides.type}`,
    isDeleted: false,
    metadata: null,
    organizationId: 'org-1',
    type: overrides.type,
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('ExpertPositioningService', () => {
  let service: ExpertPositioningService;
  let brandDelegate: { findFirst: ReturnType<typeof vi.fn> };
  let brandMemoryService: {
    upsertTypedEntry: ReturnType<typeof vi.fn>;
    listTypedEntries: ReturnType<typeof vi.fn>;
  };
  let harnessProfilesService: {
    upsertPositioningDraftForBrand: ReturnType<typeof vi.fn>;
  };
  let logger: LoggerService;

  beforeEach(() => {
    brandDelegate = { findFirst: vi.fn() };
    brandMemoryService = {
      listTypedEntries: vi.fn().mockResolvedValue([]),
      upsertTypedEntry: vi.fn().mockResolvedValue({ id: 'memory-1' }),
    };
    harnessProfilesService = {
      upsertPositioningDraftForBrand: vi.fn(),
    };
    logger = makeLogger();

    service = new ExpertPositioningService(
      { brand: brandDelegate } as unknown as PrismaService,
      brandMemoryService as unknown as BrandMemoryService,
      harnessProfilesService as unknown as HarnessProfilesService,
      logger,
    );
  });

  describe('saveAnswer', () => {
    it('upserts typed memory positioning.<fieldKey> with metadata', async () => {
      await service.saveAnswer({
        answer: 'I used to run finance at a startup.',
        brandId: 'brand-1',
        fieldKey: 'originStory',
        interviewId: 'interview-1',
        organizationId: 'org-1',
      });

      expect(brandMemoryService.upsertTypedEntry).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        {
          content: 'I used to run finance at a startup.',
          metadata: {
            fieldKey: 'originStory',
            interviewId: 'interview-1',
            source: 'brand-interview',
          },
          type: 'positioning.originStory',
        },
      );
    });
  });

  describe('readAnswers', () => {
    it('keeps only the newest answer per field key and ignores unknown keys/blank content', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([
        // Newest first — the service must keep this one for originStory.
        makeTypedEntry({
          content: 'Second version',
          type: 'positioning.originStory',
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
        makeTypedEntry({
          content: 'First version (stale)',
          type: 'positioning.originStory',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        // Unknown field key — must be ignored even though it has the prefix.
        makeTypedEntry({
          content: 'Some content',
          type: 'positioning.notAKnownKey',
        }),
        // Blank content — must be ignored.
        makeTypedEntry({
          content: '   ',
          type: 'positioning.bigDomino',
        }),
      ]);

      const answers = await service.readAnswers('org-1', 'brand-1');

      expect(brandMemoryService.listTypedEntries).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'positioning.',
      );
      expect(answers).toEqual({ originStory: 'Second version' });
    });

    it('returns an empty object when there are no stored entries', async () => {
      brandMemoryService.listTypedEntries.mockResolvedValue([]);

      await expect(service.readAnswers('org-1', 'brand-1')).resolves.toEqual(
        {},
      );
    });
  });

  describe('generateDraft', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('throws NotFoundException for a missing brand', async () => {
      brandDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDraft({
          brandId: 'brand-missing',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(
        harnessProfilesService.upsertPositioningDraftForBrand,
      ).not.toHaveBeenCalled();
    });

    it('scores the answers, builds the draft from agentConfig.voice/strategy.platforms, and upserts it', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: {
          strategy: { platforms: ['tiktok', 'linkedin'] },
          voice: {
            audience: ['founders'],
            bannedPhrases: ['synergy'],
            doNotSoundLike: ['corporate jargon'],
            messagingPillars: ['clarity over hype'],
            style: 'Direct',
            tone: 'Confident',
          },
        },
        id: 'brand-1',
        label: 'Acme Co',
      });

      const answers: ExpertPositioningAnswers = {
        authoritySignals: 'I have certified 200 clients and grew revenue 3x.',
        bigDomino:
          'If people believed process beats talent, every objection would stop mattering.',
        contrarianBeliefs:
          'Most people think hustle is the answer, but it is not.',
        newOpportunity: 'Stop grinding; instead build systems.',
        notForWho: 'Not for people looking for a quick fix.',
        originStory:
          'I used to work a corporate job, then I hit a wall and realized systems beat hustle. Now I teach founders.',
        transformation:
          'I went from burnout to running a lean, profitable studio.',
      };
      brandMemoryService.listTypedEntries.mockResolvedValue(
        Object.entries(answers).map(([fieldKey, content]) =>
          makeTypedEntry({
            content: content as string,
            type: `positioning.${fieldKey}`,
          }),
        ),
      );

      const resolvedProfile = {
        id: 'profile-1',
      } as unknown as HarnessProfileDocument;
      harnessProfilesService.upsertPositioningDraftForBrand.mockResolvedValue(
        resolvedProfile,
      );

      const result = await service.generateDraft({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const expectedScore = scoreExpertPositioning(
        answers,
        new Date('2026-03-01T00:00:00.000Z'),
      );
      const expectedDraft = buildExpertHarnessDraft({
        answers,
        brandId: 'brand-1',
        brandLabel: 'Acme Co',
        platforms: ['tiktok', 'linkedin'],
        score: expectedScore,
        voice: {
          audience: ['founders'],
          bannedPhrases: ['synergy'],
          doNotSoundLike: ['corporate jargon'],
          messagingPillars: ['clarity over hype'],
          style: 'Direct',
          tone: 'Confident',
        },
        generatedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      expect(
        harnessProfilesService.upsertPositioningDraftForBrand,
      ).toHaveBeenCalledWith({
        draft: expectedDraft,
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        profile: resolvedProfile,
        score: expectedScore,
      });
    });

    it('falls back to an empty platform list and "Brand" label when they are missing', async () => {
      brandDelegate.findFirst.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
        label: '   ',
      });
      brandMemoryService.listTypedEntries.mockResolvedValue([]);
      harnessProfilesService.upsertPositioningDraftForBrand.mockResolvedValue({
        id: 'profile-1',
      });

      await service.generateDraft({
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const callArgs =
        harnessProfilesService.upsertPositioningDraftForBrand.mock.calls[0][0];
      expect(callArgs.draft.platforms).toEqual([]);
      expect(callArgs.draft.label).toBe('Brand expert voice');
    });
  });
});
