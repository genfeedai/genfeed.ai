import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/enums';
import { computeBrandCompleteness } from '@genfeedai/helpers';
import type {
  IBrandInterviewAnswerResult,
  IBrandInterviewCompleteness,
  IBrandInterviewProgress,
  IBrandInterviewQuestion,
  IBrandInterviewStartResult,
} from '@genfeedai/interfaces';
import type { BrandInterview } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

import {
  BRAND_FIELD_META,
  BRAND_INTERVIEW_CREDIT_COST,
  CATALOG_BY_FIELD_KEY,
  IN_SCOPE_FIELD_KEYS,
} from '../constants/brand-interview-question-catalog.constant';

@Injectable()
export class BrandInterviewService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly logger: LoggerService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(
    brandId: string,
    organizationId: string,
    userId: string,
    creditAmount: number = BRAND_INTERVIEW_CREDIT_COST,
  ): Promise<IBrandInterviewStartResult> {
    // 1. Load brand — must belong to org and not be deleted
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    // 2. Idempotency: return existing active session without re-charging
    const existing = await this.prisma.brandInterview.findFirst({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: 'in_progress',
      },
    });

    if (existing) {
      this.logger.debug(
        `${this.constructorName} returning existing interview`,
        {
          interviewId: existing.id,
        },
      );
      return this.buildStartResult(existing, 0);
    }

    // 3. Compute completeness before the interview starts
    const completeness = computeBrandCompleteness(
      brand as Parameters<typeof computeBrandCompleteness>[0],
    );
    const completenessBefore = completeness.overallScore;
    const incompleteKeys = new Set(
      completeness.incompleteFields.map((f) => f.key),
    );

    // 4. Determine the first in-scope incomplete field
    const firstFieldKey =
      IN_SCOPE_FIELD_KEYS.find((k) => incompleteKeys.has(k)) ?? null;

    // 5. Credits preflight
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        creditAmount,
      );
    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(creditAmount, balance);
    }

    // 6. Create session — wrap in try/catch for P2002 (concurrent start race)
    let session: BrandInterview;
    try {
      session = await this.prisma.brandInterview.create({
        data: {
          answeredFields: {},
          askedFieldKeys: [],
          brandId,
          completenessBefore,
          completenessAfter: null,
          creditsCharged: creditAmount,
          currentFieldKey: firstFieldKey,
          isDeleted: false,
          organizationId,
          status: 'in_progress',
          userId,
        },
      });
    } catch (error: unknown) {
      if (this.isPrismaUniqueViolation(error)) {
        // Concurrent request already created the session — return it without charging
        const race = await this.prisma.brandInterview.findFirst({
          where: {
            brandId,
            isDeleted: false,
            organizationId,
            status: 'in_progress',
          },
        });
        if (race) {
          return this.buildStartResult(race, 0);
        }
      }
      throw error;
    }

    // 7. Deduct credits — compensate (soft-abandon) if deduction fails
    try {
      await this.creditsUtilsService.deductCreditsFromOrganization(
        organizationId,
        userId,
        creditAmount,
        'Brand context interview',
        ActivitySource.BRAND_INTERVIEW,
      );
    } catch (error: unknown) {
      // Compensate: soft-delete the session so the unique index is freed
      await this.prisma.brandInterview.update({
        data: { isDeleted: true, status: 'abandoned' },
        where: { id: session.id },
      });
      throw error;
    }

    return this.buildStartResult(session, creditAmount);
  }

  async submitAnswer(
    interviewId: string,
    organizationId: string,
    _userId: string,
    answer: string,
  ): Promise<IBrandInterviewAnswerResult> {
    const session = await this.loadActiveSession(interviewId, organizationId);
    const { brandId } = session;

    const fieldKey = session.currentFieldKey;
    if (!fieldKey) {
      throw new BadRequestException(
        'No current question — this interview is already complete or has no remaining gaps.',
      );
    }

    const question = CATALOG_BY_FIELD_KEY[fieldKey];
    if (!question) {
      throw new BadRequestException(`Unknown field key: ${fieldKey}`);
    }

    // Normalize the answer
    const normalized = this.normalizeAnswer(answer, question);

    // Write to brand
    await this.writeFieldToBrand(brandId, organizationId, fieldKey, normalized);

    // Update session state
    const answeredFields =
      (session.answeredFields as Record<string, unknown>) ?? {};
    const updatedAnsweredFields = { ...answeredFields, [fieldKey]: normalized };
    const askedFieldKeys = [...(session.askedFieldKeys ?? []), fieldKey];

    // Reload brand to recompute completeness after write
    const updatedBrand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false },
    });

    const completeness = computeBrandCompleteness(
      (updatedBrand ?? {}) as Parameters<typeof computeBrandCompleteness>[0],
    );
    const incompleteKeys = new Set(
      completeness.incompleteFields.map((f) => f.key),
    );

    // Next field: in-scope, incomplete, not already answered in this session
    const answeredInSession = new Set(Object.keys(updatedAnsweredFields));
    const nextFieldKey =
      IN_SCOPE_FIELD_KEYS.find(
        (k) => incompleteKeys.has(k) && !answeredInSession.has(k),
      ) ?? null;

    const isComplete = nextFieldKey === null;
    const newStatus = isComplete ? 'completed' : 'in_progress';
    const completenessAfter = isComplete ? completeness.overallScore : null;

    const updated = await this.prisma.brandInterview.update({
      data: {
        answeredFields: updatedAnsweredFields,
        askedFieldKeys,
        completenessAfter,
        currentFieldKey: nextFieldKey,
        status: newStatus,
      },
      where: { id: interviewId },
    });

    const progress = this.buildProgress(updated);

    return {
      completenessScore: completeness.overallScore,
      interviewId,
      isComplete,
      nextQuestion: nextFieldKey
        ? (CATALOG_BY_FIELD_KEY[nextFieldKey] ?? null)
        : null,
      progress,
      status: newStatus,
    };
  }

  async skipField(
    interviewId: string,
    organizationId: string,
  ): Promise<IBrandInterviewAnswerResult> {
    const session = await this.loadActiveSession(interviewId, organizationId);

    const fieldKey = session.currentFieldKey;
    if (!fieldKey) {
      throw new BadRequestException('No current question to skip.');
    }

    const askedFieldKeys = [...(session.askedFieldKeys ?? []), fieldKey];
    const answeredFields =
      (session.answeredFields as Record<string, unknown>) ?? {};
    const answeredInSession = new Set(Object.keys(answeredFields));

    // Reload brand completeness to find the next gap
    const brand = await this.prisma.brand.findFirst({
      where: { id: session.brandId, isDeleted: false },
    });

    const completeness = computeBrandCompleteness(
      (brand ?? {}) as Parameters<typeof computeBrandCompleteness>[0],
    );
    const incompleteKeys = new Set(
      completeness.incompleteFields.map((f) => f.key),
    );
    const skippedSet = new Set(askedFieldKeys);

    // Next field: in-scope, incomplete, not already answered or skipped in this session
    const nextFieldKey =
      IN_SCOPE_FIELD_KEYS.find(
        (k) =>
          incompleteKeys.has(k) &&
          !answeredInSession.has(k) &&
          !skippedSet.has(k),
      ) ?? null;

    const isComplete = nextFieldKey === null;
    const newStatus = isComplete ? 'completed' : 'in_progress';
    const completenessAfter = isComplete ? completeness.overallScore : null;

    const updated = await this.prisma.brandInterview.update({
      data: {
        askedFieldKeys,
        completenessAfter,
        currentFieldKey: nextFieldKey,
        status: newStatus,
      },
      where: { id: interviewId },
    });

    const progress = this.buildProgress(updated);

    return {
      completenessScore: completeness.overallScore,
      interviewId,
      isComplete,
      nextQuestion: nextFieldKey
        ? (CATALOG_BY_FIELD_KEY[nextFieldKey] ?? null)
        : null,
      progress,
      status: newStatus,
    };
  }

  async abandon(
    interviewId: string,
    organizationId: string,
  ): Promise<BrandInterview> {
    const session = await this.prisma.brandInterview.findFirst({
      where: { id: interviewId, isDeleted: false, organizationId },
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    if (session.status !== 'in_progress') {
      throw new BadRequestException(
        'Only in-progress interviews can be abandoned.',
      );
    }

    return this.prisma.brandInterview.update({
      data: { status: 'abandoned' },
      where: { id: interviewId },
    });
  }

  async getById(
    interviewId: string,
    organizationId: string,
  ): Promise<BrandInterview> {
    const session = await this.prisma.brandInterview.findFirst({
      where: { id: interviewId, isDeleted: false, organizationId },
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    return session;
  }

  async getActiveForBrand(
    brandId: string,
    organizationId: string,
  ): Promise<BrandInterview | null> {
    return this.prisma.brandInterview.findFirst({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: 'in_progress',
      },
    });
  }

  async getCompleteness(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandInterviewCompleteness> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const result = computeBrandCompleteness(
      brand as Parameters<typeof computeBrandCompleteness>[0],
    );
    const incompleteInScope = result.incompleteFields.filter((f) =>
      IN_SCOPE_FIELD_KEYS.includes(f.key),
    );

    return {
      incompleteFieldKeys: incompleteInScope.map((f) => f.key),
      interviewableGapCount: incompleteInScope.length,
      overallScore: result.overallScore,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadActiveSession(
    interviewId: string,
    organizationId: string,
  ): Promise<BrandInterview> {
    const session = await this.prisma.brandInterview.findFirst({
      where: { id: interviewId, isDeleted: false, organizationId },
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    if (session.status !== 'in_progress') {
      throw new BadRequestException(
        `Interview is not in progress (current status: ${session.status}).`,
      );
    }

    return session;
  }

  private normalizeAnswer(
    raw: string,
    question: IBrandInterviewQuestion,
  ): string | string[] {
    if (question.answerType === 'list') {
      const items = raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length === 0) {
        throw new BadRequestException('Answer must contain at least one item.');
      }
      return items;
    }

    if (question.answerType === 'enum') {
      const trimmed = raw.trim();
      if (!question.enumOptions?.includes(trimmed)) {
        throw new BadRequestException(
          `Invalid option "${trimmed}". Valid options: ${question.enumOptions?.join(', ')}.`,
        );
      }
      return trimmed;
    }

    // text
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Answer cannot be empty.');
    }
    return trimmed;
  }

  /**
   * Write a single field value back to the Brand record.
   * Uses a read-modify-write for nested agentConfig fields to preserve siblings.
   * Never calls BrandsService.updateAgentConfig (it shallow-overwrites the group).
   */
  private async writeFieldToBrand(
    brandId: string,
    organizationId: string,
    fieldKey: string,
    value: string | string[],
  ): Promise<void> {
    const meta = BRAND_FIELD_META[fieldKey];
    if (!meta) {
      throw new BadRequestException(`No field metadata for key: ${fieldKey}`);
    }

    if (meta.storage === 'brand') {
      // Direct column update
      await this.prisma.brand.update({
        data: { [fieldKey]: value },
        where: { id: brandId },
      });
    } else {
      // Nested agentConfig update — must read first to preserve sibling fields
      const brand = await this.prisma.brand.findFirst({
        where: { id: brandId, isDeleted: false, organizationId },
      });

      if (!brand) {
        throw new NotFoundException('Brand', brandId);
      }

      const cfg = (brand.agentConfig as Record<string, unknown>) ?? {};
      const grpKey = meta.storage; // 'voice' | 'strategy'
      const grp = (cfg[grpKey] as Record<string, unknown>) ?? {};
      cfg[grpKey] = { ...grp, [fieldKey]: value };

      await this.prisma.brand.update({
        data: { agentConfig: cfg },
        where: { id: brandId },
      });
    }

    // Invalidate brand caches after write
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(organizationId),
    );
  }

  private buildProgress(session: BrandInterview): IBrandInterviewProgress {
    const answered = Object.keys(
      (session.answeredFields as Record<string, unknown>) ?? {},
    ).length;
    const total = IN_SCOPE_FIELD_KEYS.length;

    return {
      answeredFields: answered,
      percentComplete: total > 0 ? Math.round((answered / total) * 100) : 100,
      totalFields: total,
    };
  }

  private buildStartResult(
    session: BrandInterview,
    creditsCharged: number,
  ): IBrandInterviewStartResult {
    const currentQuestion: IBrandInterviewQuestion | null =
      session.currentFieldKey
        ? (CATALOG_BY_FIELD_KEY[session.currentFieldKey] ?? null)
        : null;

    const progress = this.buildProgress(session);

    return {
      brandId: session.brandId,
      completenessScore: session.completenessBefore,
      creditsCharged,
      currentQuestion,
      interviewId: session.id,
      progress,
      status: session.status as IBrandInterviewStartResult['status'],
    };
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
