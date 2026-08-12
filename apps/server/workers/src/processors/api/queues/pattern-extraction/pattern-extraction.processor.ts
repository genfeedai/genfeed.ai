import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { Prisma } from '@genfeedai/prisma';
import {
  PATTERN_EXTRACTION_QUEUE,
  type PatternExtractionJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  AD_PERFORMANCE_CHECKPOINT_SOURCE,
  CONTENT_PERFORMANCE_CHECKPOINT_SOURCE,
  GROUPS_CHECKPOINT_SOURCE,
  PATTERN_EXTRACTION_MIN_SCORE,
  PATTERN_EXTRACTION_PAGE_SIZE,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.constants';
import {
  advanceCursor,
  buildCursorWhere,
  buildPatternPayloads,
  classifyAdRow,
  classifyContentRow,
  deserializeGroups,
  mergeClassifiedRecords,
  readObjectRecord,
  serializeGroups,
  toUpsertInput,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.logic';
import type {
  PatternExtractionCursor,
  PatternGroupState,
  StoredCheckpoint,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.types';
import type { Job } from 'bullmq';

@Injectable()
@Processor(PATTERN_EXTRACTION_QUEUE)
export class PatternExtractionProcessor extends WorkerHost {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly creativePatternsService: CreativePatternsService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<PatternExtractionJobData>): Promise<void> {
    this.logger.log(
      `${this.constructorName} processing one pattern-extraction scan`,
    );

    try {
      const [adCheckpoint, contentCheckpoint, groupsCheckpoint] =
        await Promise.all([
          this.loadCheckpoint(AD_PERFORMANCE_CHECKPOINT_SOURCE),
          this.loadCheckpoint(CONTENT_PERFORMANCE_CHECKPOINT_SOURCE),
          this.loadCheckpoint(GROUPS_CHECKPOINT_SOURCE),
        ]);

      const groups = deserializeGroups(groupsCheckpoint?.data);
      const adCursor = await this.scanAdPerformance(adCheckpoint, groups);
      const contentCursor = await this.scanContentPerformance(
        contentCheckpoint,
        groups,
      );

      const now = new Date();
      const payloads = buildPatternPayloads(groups.values(), now);
      let upsertedCount = 0;

      for (const payload of payloads) {
        try {
          await this.creativePatternsService.upsertPattern(
            toUpsertInput(payload),
          );
          upsertedCount += 1;
        } catch (error: unknown) {
          this.logger.error(
            `${this.constructorName} failed to upsert ${payload.scope} pattern: ${payload.formula}`,
            (error as Error).message,
          );
        }
      }

      await Promise.all([
        this.saveCheckpoint(AD_PERFORMANCE_CHECKPOINT_SOURCE, adCursor, {}),
        this.saveCheckpoint(
          CONTENT_PERFORMANCE_CHECKPOINT_SOURCE,
          contentCursor,
          {},
        ),
        this.saveCheckpoint(
          GROUPS_CHECKPOINT_SOURCE,
          contentCursor ?? adCursor,
          serializeGroups(groups),
        ),
      ]);

      await job.updateProgress(100);
      this.logger.log(
        `${this.constructorName} pattern extraction completed. Upserted ${upsertedCount} patterns`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} pattern extraction failed`,
        (error as Error).message,
      );
      throw error;
    }
  }

  private async scanAdPerformance(
    checkpoint: StoredCheckpoint | null,
    groups: Map<string, PatternGroupState>,
  ): Promise<PatternExtractionCursor | null> {
    let cursor = this.toCursor(checkpoint);
    let scanned = 0;

    for (;;) {
      const page = await this.prisma.adPerformance.findMany({
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: {
          adPlatform: true,
          createdAt: true,
          ctaText: true,
          data: true,
          headlineText: true,
          id: true,
          industry: true,
          organizationId: true,
          performanceScore: true,
          updatedAt: true,
        },
        take: PATTERN_EXTRACTION_PAGE_SIZE,
        where: {
          AND: [
            { isDeleted: false },
            {
              OR: [
                { performanceScore: { gte: PATTERN_EXTRACTION_MIN_SCORE } },
                { performanceScore: null },
              ],
            },
            ...(cursor ? [buildCursorWhere(cursor)] : []),
          ],
        },
      });

      if (page.length === 0) {
        break;
      }

      for (const row of page) {
        mergeClassifiedRecords(
          groups,
          classifyAdRow(row, this.toCursor(checkpoint)),
        );
      }

      scanned += page.length;
      cursor = advanceCursor(page, cursor);
      if (page.length < PATTERN_EXTRACTION_PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(
      `${this.constructorName} scanned ${scanned} ad performance page rows`,
    );
    return cursor;
  }

  private async scanContentPerformance(
    checkpoint: StoredCheckpoint | null,
    groups: Map<string, PatternGroupState>,
  ): Promise<PatternExtractionCursor | null> {
    let cursor = this.toCursor(checkpoint);
    let scanned = 0;

    for (;;) {
      const page = await this.prisma.contentPerformance.findMany({
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: {
          createdAt: true,
          data: true,
          id: true,
          organizationId: true,
          performanceScore: true,
          platform: true,
          updatedAt: true,
        },
        take: PATTERN_EXTRACTION_PAGE_SIZE,
        where: {
          AND: [
            { isDeleted: false },
            {
              OR: [
                { performanceScore: { gte: PATTERN_EXTRACTION_MIN_SCORE } },
                { performanceScore: null },
              ],
            },
            ...(cursor ? [buildCursorWhere(cursor)] : []),
          ],
        },
      });

      if (page.length === 0) {
        break;
      }

      for (const row of page) {
        mergeClassifiedRecords(
          groups,
          classifyContentRow(row, this.toCursor(checkpoint)),
        );
      }

      scanned += page.length;
      cursor = advanceCursor(page, cursor);
      if (page.length < PATTERN_EXTRACTION_PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(
      `${this.constructorName} scanned ${scanned} content performance page rows`,
    );
    return cursor;
  }

  private async loadCheckpoint(
    source: string,
  ): Promise<StoredCheckpoint | null> {
    const row = await this.prisma.patternExtractionCheckpoint.findUnique({
      select: {
        data: true,
        measuredAt: true,
        sourceId: true,
      },
      where: { source },
    });
    if (!row) {
      return null;
    }
    return {
      data: readObjectRecord(row.data),
      measuredAt: row.measuredAt,
      sourceId: row.sourceId,
    };
  }

  private async saveCheckpoint(
    source: string,
    cursor: PatternExtractionCursor | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!cursor) {
      return;
    }
    const jsonData = data as Prisma.InputJsonValue;
    await this.prisma.patternExtractionCheckpoint.upsert({
      create: {
        data: jsonData,
        lastRunAt: new Date(),
        measuredAt: cursor.measuredAt,
        source,
        sourceId: cursor.sourceId,
      },
      update: {
        data: jsonData,
        lastRunAt: new Date(),
        measuredAt: cursor.measuredAt,
        sourceId: cursor.sourceId,
      },
      where: { source },
    });
  }

  private toCursor(
    checkpoint: StoredCheckpoint | null,
  ): PatternExtractionCursor | null {
    if (!checkpoint) {
      return null;
    }
    return {
      measuredAt: checkpoint.measuredAt,
      sourceId: checkpoint.sourceId,
    };
  }
}
