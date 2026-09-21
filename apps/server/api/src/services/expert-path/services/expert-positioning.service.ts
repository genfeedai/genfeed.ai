import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import type { HarnessProfileDocument } from '@api/collections/harness-profiles/schemas/harness-profile.schema';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { buildExpertHarnessDraft } from '@api/services/expert-path/utils/expert-harness-draft.util';
import { scoreExpertPositioning } from '@api/services/expert-path/utils/expert-positioning-score.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  EXPERT_POSITIONING_MEMORY_TYPE_PREFIX,
  type ExpertPositioningAnswers,
  type ExpertPositioningFieldKey,
  isExpertPositioningFieldKey,
  toExpertPositioningMemoryType,
} from '@genfeedai/contracts/constants';
import type { IExpertPositioningScore } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ExpertPositioningDraftResult {
  profile: HarnessProfileDocument;
  score: IExpertPositioningScore;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Expert Path positioning: persists interview answers as typed brand memory
 * and turns them into a scored harness profile draft.
 */
@Injectable()
export class ExpertPositioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly harnessProfilesService: HarnessProfilesService,
    private readonly logger: LoggerService,
  ) {}

  saveAnswer(params: {
    answer: string;
    brandId: string;
    fieldKey: ExpertPositioningFieldKey;
    interviewId: string;
    organizationId: string;
  }) {
    return this.brandMemoryService.upsertTypedEntry(
      params.organizationId,
      params.brandId,
      {
        content: params.answer,
        metadata: {
          fieldKey: params.fieldKey,
          interviewId: params.interviewId,
          source: 'brand-interview',
        },
        type: toExpertPositioningMemoryType(params.fieldKey),
      },
    );
  }

  async readAnswers(
    organizationId: string,
    brandId: string,
  ): Promise<ExpertPositioningAnswers> {
    const entries = await this.brandMemoryService.listTypedEntries(
      organizationId,
      brandId,
      EXPERT_POSITIONING_MEMORY_TYPE_PREFIX,
    );

    const answers: ExpertPositioningAnswers = {};
    // Entries arrive newest first; keep the latest answer per field.
    for (const entry of entries) {
      const fieldKey = entry.type?.slice(
        EXPERT_POSITIONING_MEMORY_TYPE_PREFIX.length,
      );
      if (
        fieldKey &&
        isExpertPositioningFieldKey(fieldKey) &&
        answers[fieldKey] === undefined &&
        entry.content?.trim()
      ) {
        answers[fieldKey] = entry.content.trim();
      }
    }
    return answers;
  }

  /**
   * Score the stored answers and upsert the brand's harness profile draft.
   * Manual profile edits are preserved (see `upsertPositioningDraftForBrand`).
   */
  async generateDraft(params: {
    brandId: string;
    organizationId: string;
    userId: string;
  }): Promise<ExpertPositioningDraftResult> {
    const brand = await this.prisma.brand.findFirst({
      select: { agentConfig: true, id: true, label: true },
      where: scopedWhere(params.organizationId, { id: params.brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', params.brandId);
    }

    const answers = await this.readAnswers(
      params.organizationId,
      params.brandId,
    );
    const score = scoreExpertPositioning(answers);
    const agentConfig = readRecord(brand.agentConfig) as BrandAgentConfig;
    const draft = buildExpertHarnessDraft({
      answers,
      brandId: brand.id,
      brandLabel: brand.label?.trim() || 'Brand',
      platforms: readStringList(readRecord(agentConfig.strategy).platforms),
      score,
      voice: readRecord(agentConfig.voice),
    });

    const profile =
      await this.harnessProfilesService.upsertPositioningDraftForBrand({
        draft,
        organizationId: params.organizationId,
        userId: params.userId,
      });

    this.logger.log('Expert positioning draft generated', {
      brandId: params.brandId,
      organizationId: params.organizationId,
      profileId: profile.id,
      totalScore: score.totalScore,
      weakestDimension: score.weakestDimension,
    });

    return { profile, score };
  }
}
