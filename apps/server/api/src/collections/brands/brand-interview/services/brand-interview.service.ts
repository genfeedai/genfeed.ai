import type { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, BrandInterviewStatus } from '@genfeedai/enums';
import { computeBrandCompleteness } from '@genfeedai/helpers';
import type {
  BrandInterviewAnswerValue,
  IActiveBrandInterview,
  IBrandInterviewAnswerResult,
  IBrandInterviewCompleteness,
  IBrandInterviewProgress,
  IBrandInterviewQuestion,
  IBrandInterviewStartResult,
  IBrandInterviewStep,
} from '@genfeedai/interfaces';
import type { BrandInterview, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BRAND_FIELD_META,
  BRAND_INTERVIEW_CREDIT_COST,
  BRAND_INTERVIEW_QUESTION_CATALOG,
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
    private readonly brandsService: BrandsService,
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
      where: scopedWhere(organizationId, { id: brandId }),
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    // 2. Idempotency: return existing active session without re-charging
    const existing = await this.prisma.brandInterview.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        status: BrandInterviewStatus.IN_PROGRESS,
      }),
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
          status: BrandInterviewStatus.IN_PROGRESS,
          userId,
        },
      });
    } catch (error: unknown) {
      if (this.isPrismaUniqueViolation(error)) {
        // Concurrent request already created the session — return it without charging
        const race = await this.prisma.brandInterview.findFirst({
          where: scopedWhere(organizationId, {
            brandId,
            status: BrandInterviewStatus.IN_PROGRESS,
          }),
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
        data: { isDeleted: true, status: BrandInterviewStatus.ABANDONED },
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
    fieldKeyOverride?: string,
  ): Promise<IBrandInterviewAnswerResult> {
    const session = await this.loadActiveSession(interviewId, organizationId);
    const { brandId } = session;
    const answeredFields = this.readAnsweredFields(session);

    const requestedKey = fieldKeyOverride?.trim() || session.currentFieldKey;
    if (!requestedKey) {
      throw new BadRequestException(
        'No current question — this interview is already complete or has no remaining gaps.',
      );
    }

    const isCurrent = requestedKey === session.currentFieldKey;
    const isPastAnswer = Object.hasOwn(answeredFields, requestedKey);

    if (!isCurrent && !isPastAnswer) {
      throw new BadRequestException(
        'You can only answer the current question or re-save a previously answered step.',
      );
    }

    const question = CATALOG_BY_FIELD_KEY[requestedKey];
    if (!question) {
      throw new BadRequestException(`Unknown field key: ${requestedKey}`);
    }

    // Normalize the answer
    const normalized = this.normalizeAnswer(answer, question);

    // Write to brand
    await this.writeFieldToBrand(
      brandId,
      organizationId,
      requestedKey,
      normalized,
    );

    // Update session state
    const updatedAnsweredFields = {
      ...answeredFields,
      [requestedKey]: normalized,
    };

    // Re-saving a past answer updates brand + ledger but keeps the session
    // cursor on the frontier so the user can return via the steps sidebar.
    if (!isCurrent) {
      const updated = await this.prisma.brandInterview.update({
        data: {
          answeredFields: updatedAnsweredFields as Prisma.InputJsonValue,
        },
        where: scopedWhere(organizationId, { id: interviewId }),
      });

      return this.buildAnswerResult(updated, {
        completenessScore: session.completenessBefore,
        isComplete: false,
        nextFieldKey: session.currentFieldKey,
        status: BrandInterviewStatus.IN_PROGRESS,
      });
    }

    const askedFieldKeys = [...(session.askedFieldKeys ?? []), requestedKey];

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

    // Next field: in-scope, incomplete, and not already answered or skipped in
    // this session. askedFieldKeys tracks both answered and skipped fields, so
    // excluding it (mirroring skipField) prevents a previously-skipped question
    // from being re-presented after the user answers another field — which would
    // otherwise keep the interview from ever completing.
    const answeredInSession = new Set(Object.keys(updatedAnsweredFields));
    const askedSet = new Set(askedFieldKeys);
    const nextFieldKey =
      IN_SCOPE_FIELD_KEYS.find(
        (k) =>
          incompleteKeys.has(k) &&
          !answeredInSession.has(k) &&
          !askedSet.has(k),
      ) ?? null;

    const isComplete = nextFieldKey === null;
    const newStatus = isComplete
      ? BrandInterviewStatus.COMPLETED
      : BrandInterviewStatus.IN_PROGRESS;
    const completenessAfter = isComplete ? completeness.overallScore : null;

    const updated = await this.prisma.brandInterview.update({
      data: {
        answeredFields: updatedAnsweredFields as Prisma.InputJsonValue,
        askedFieldKeys,
        completenessAfter,
        currentFieldKey: nextFieldKey,
        status: newStatus,
      },
      where: { id: interviewId },
    });

    return this.buildAnswerResult(updated, {
      completenessScore: completeness.overallScore,
      isComplete,
      nextFieldKey,
      status: newStatus,
    });
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
    const newStatus = isComplete
      ? BrandInterviewStatus.COMPLETED
      : BrandInterviewStatus.IN_PROGRESS;
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

    return this.buildAnswerResult(updated, {
      completenessScore: completeness.overallScore,
      isComplete,
      nextFieldKey,
      status: newStatus,
    });
  }

  async abandon(
    interviewId: string,
    organizationId: string,
  ): Promise<BrandInterview> {
    const session = await this.prisma.brandInterview.findFirst({
      where: scopedWhere(organizationId, { id: interviewId }),
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    if (session.status !== BrandInterviewStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Only in-progress interviews can be abandoned.',
      );
    }

    return this.prisma.brandInterview.update({
      data: { status: BrandInterviewStatus.ABANDONED },
      where: { id: interviewId },
    });
  }

  async getById(
    interviewId: string,
    organizationId: string,
  ): Promise<BrandInterview> {
    const session = await this.prisma.brandInterview.findFirst({
      where: scopedWhere(organizationId, { id: interviewId }),
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    return session;
  }

  async getActiveForBrand(
    brandId: string,
    organizationId: string,
  ): Promise<IActiveBrandInterview | null> {
    const session = await this.prisma.brandInterview.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        status: BrandInterviewStatus.IN_PROGRESS,
      }),
    });

    if (!session) {
      return null;
    }

    return this.buildActiveResult(session);
  }

  async getCompleteness(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandInterviewCompleteness> {
    const brand = await this.prisma.brand.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
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
      where: scopedWhere(organizationId, { id: interviewId }),
    });

    if (!session) {
      throw new NotFoundException('BrandInterview', interviewId);
    }

    if (session.status !== BrandInterviewStatus.IN_PROGRESS) {
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
   * Nested agentConfig fields go through the canonical merge boundary so they
   * preserve siblings and cannot bypass enabled-skill validation.
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
      // Direct column update — scope by org + isDeleted (matching the
      // agentConfig branch) so a known brandId can't write across tenants.
      const updated = await this.prisma.brand.updateMany({
        data: { [fieldKey]: value },
        where: scopedWhere(organizationId, { id: brandId }),
      });
      if (updated.count === 0) {
        throw new NotFoundException('Brand', brandId);
      }
    } else {
      const updated = await this.brandsService.updateAgentConfig(
        brandId,
        organizationId,
        {
          [meta.storage]: { [fieldKey]: value },
        } as UpdateBrandAgentConfigDto,
      );

      if (!updated) {
        throw new NotFoundException('Brand', brandId);
      }
    }

    // Invalidate brand caches after write
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(organizationId),
    );
  }

  private readAnsweredFields(
    session: BrandInterview,
  ): Record<string, BrandInterviewAnswerValue> {
    const raw = (session.answeredFields as Record<string, unknown>) ?? {};
    const out: Record<string, BrandInterviewAnswerValue> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string') {
        out[key] = value;
        continue;
      }
      if (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
      ) {
        out[key] = value;
      }
    }

    return out;
  }

  private formatAnswerPreview(value: BrandInterviewAnswerValue): string {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(', ');
    }
    return value.trim();
  }

  private buildSteps(session: BrandInterview): IBrandInterviewStep[] {
    const answeredFields = this.readAnsweredFields(session);
    const answeredKeys = new Set(Object.keys(answeredFields));
    const askedKeys = new Set(session.askedFieldKeys ?? []);
    const currentKey = session.currentFieldKey;

    return BRAND_INTERVIEW_QUESTION_CATALOG.map((question) => {
      const isCurrent = question.fieldKey === currentKey;
      const isAnswered = answeredKeys.has(question.fieldKey);
      const isSkipped =
        !isCurrent && !isAnswered && askedKeys.has(question.fieldKey);

      let status: IBrandInterviewStep['status'] = 'upcoming';
      if (isCurrent) {
        status = 'current';
      } else if (isAnswered) {
        status = 'answered';
      } else if (isSkipped) {
        status = 'skipped';
      }

      const answer = answeredFields[question.fieldKey];
      const answerPreview =
        answer === undefined
          ? undefined
          : this.formatAnswerPreview(answer).slice(0, 120);

      return {
        answerPreview: answerPreview || undefined,
        fieldKey: question.fieldKey,
        group: question.group,
        isNavigable: isCurrent || isAnswered,
        label: question.questionText,
        question,
        status,
      };
    });
  }

  private buildProgress(session: BrandInterview): IBrandInterviewProgress {
    const answered = Object.keys(this.readAnsweredFields(session)).length;
    const total = IN_SCOPE_FIELD_KEYS.length;

    return {
      answeredFields: answered,
      percentComplete: total > 0 ? Math.round((answered / total) * 100) : 100,
      totalFields: total,
    };
  }

  private buildAnswerResult(
    session: BrandInterview,
    opts: {
      completenessScore: number;
      isComplete: boolean;
      nextFieldKey: string | null;
      status: IBrandInterviewAnswerResult['status'];
    },
  ): IBrandInterviewAnswerResult {
    return {
      answeredFields: this.readAnsweredFields(session),
      completenessScore: opts.completenessScore,
      interviewId: session.id,
      isComplete: opts.isComplete,
      nextQuestion: opts.nextFieldKey
        ? (CATALOG_BY_FIELD_KEY[opts.nextFieldKey] ?? null)
        : null,
      progress: this.buildProgress(session),
      status: opts.status,
      steps: this.buildSteps(session),
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
      answeredFields: this.readAnsweredFields(session),
      brandId: session.brandId,
      completenessScore: session.completenessBefore,
      creditsCharged,
      currentQuestion,
      interviewId: session.id,
      progress,
      status: session.status as IBrandInterviewStartResult['status'],
      steps: this.buildSteps(session),
    };
  }

  /**
   * Map a raw BrandInterview row to the IActiveBrandInterview shape consumed
   * by the frontend resume hook. Resolves currentFieldKey → currentQuestion and
   * surfaces completenessBefore as completenessScore.
   */
  private buildActiveResult(session: BrandInterview): IActiveBrandInterview {
    const currentQuestion: IBrandInterviewQuestion | null =
      session.currentFieldKey
        ? (CATALOG_BY_FIELD_KEY[session.currentFieldKey] ?? null)
        : null;

    const answeredFields = this.readAnsweredFields(session);

    return {
      answeredCount: Object.keys(answeredFields).length,
      answeredFields,
      brandId: session.brandId,
      completenessScore: session.completenessBefore,
      currentQuestion,
      id: session.id,
      status: session.status as IActiveBrandInterview['status'],
      steps: this.buildSteps(session),
      totalCount: IN_SCOPE_FIELD_KEYS.length,
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
