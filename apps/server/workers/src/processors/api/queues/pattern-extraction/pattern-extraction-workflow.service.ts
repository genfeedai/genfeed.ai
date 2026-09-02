import { createHash } from 'node:crypto';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AD_PERFORMANCE_CHECKPOINT_SOURCE,
  CONTENT_PERFORMANCE_CHECKPOINT_SOURCE,
  GROUPS_CHECKPOINT_SOURCE,
  PATTERN_EXTRACTION_MIN_ORGS_FOR_PUBLIC,
  PATTERN_EXTRACTION_MIN_SCORE,
  PATTERN_EXTRACTION_PAGE_SIZE,
  PUBLIC_PATTERN_TTL_MS,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.constants';
import {
  advanceCursor,
  buildCursorWhere,
  buildPatternPayloads,
  classifyAdRow,
  classifyContentRow,
  deserializeGroups,
  mergeClassifiedRecords,
  patternGroupKey,
  readObjectRecord,
  serializeGroups,
  toUpsertInput,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.logic';
import type {
  PatternExtractionCursor,
  StoredCheckpoint,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction.types';
import {
  buildPatternCandidateWorkflowDefinition,
  buildPatternExtractionWorkflowDefinition,
  PATTERN_EXTRACTION_ACTION_IDS,
} from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow-definition';

type SerializedCheckpoint = {
  data: Record<string, unknown>;
  measuredAt: string;
  sourceId: string;
};

type SerializedCursor = {
  measuredAt: string;
  sourceId: string;
};

type ExtractionState = {
  adCheckpoint?: SerializedCheckpoint;
  adCursor?: SerializedCursor;
  contentCheckpoint?: SerializedCheckpoint;
  contentCursor?: SerializedCursor;
  groups: Record<string, unknown>;
  organizationId: string;
};

type PatternCandidate = {
  fingerprint: string;
  organizationId: string;
  privatePattern: Record<string, unknown>;
  sampleSize: number;
  scoreSum: number;
};

type FingerprintContribution = {
  sampleSize: number;
  scoreSum: number;
};

const MAX_PROMOTION_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class PatternExtractionWorkflowService implements OnModuleInit {
  private readonly logContext = 'PatternExtractionWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly creativePatternsService: CreativePatternsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.LOAD,
      (request) => this.loadAction(request),
    );
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.SCAN_ADS,
      (request) => this.scanAdsAction(request),
    );
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.SCAN_CONTENT,
      (request) => this.scanContentAction(request),
    );
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.BUILD,
      async (request) => this.buildAction(request),
    );
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.PERSIST,
      (request) => this.persistCandidateAction(request),
    );
    this.workflowRunner.registerAction(
      PATTERN_EXTRACTION_ACTION_IDS.SAVE,
      (request) => this.saveAction(request),
    );
    this.workflowRunner.registerWorkflow(
      buildPatternCandidateWorkflowDefinition(),
    );
    this.workflowRunner.registerWorkflow(
      buildPatternExtractionWorkflowDefinition(),
    );
  }

  async listEligibleOrganizationIds(): Promise<string[]> {
    const [adOrganizations, contentOrganizations] = await Promise.all([
      this.prisma.adPerformance.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: { isDeleted: false },
      }),
      this.prisma.contentPerformance.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: { isDeleted: false },
      }),
    ]);
    return [
      ...new Set(
        [...adOrganizations, ...contentOrganizations].map(
          ({ organizationId }) => organizationId,
        ),
      ),
    ].sort();
  }

  async queueOrganization(
    organizationId: string,
    dateKey: string,
  ): Promise<string> {
    const definition = buildPatternExtractionWorkflowDefinition();
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {},
        organizationId,
        source: 'pattern-extraction-sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      },
      `pattern-extraction-${organizationId}-${dateKey}`,
      { attempts: 2, replaceTerminalJob: true },
    );
  }

  private async loadAction(
    request: SystemWorkflowActionRequest,
  ): Promise<ExtractionState> {
    const organizationId = request.context.organizationId;
    const [adCheckpoint, contentCheckpoint, groupsCheckpoint] =
      await Promise.all([
        this.loadCheckpoint(
          this.organizationSource(
            AD_PERFORMANCE_CHECKPOINT_SOURCE,
            organizationId,
          ),
        ),
        this.loadCheckpoint(
          this.organizationSource(
            CONTENT_PERFORMANCE_CHECKPOINT_SOURCE,
            organizationId,
          ),
        ),
        this.loadCheckpoint(
          this.organizationSource(GROUPS_CHECKPOINT_SOURCE, organizationId),
        ),
      ]);
    return {
      ...(adCheckpoint
        ? { adCheckpoint: this.serializeCheckpoint(adCheckpoint) }
        : {}),
      ...(contentCheckpoint
        ? { contentCheckpoint: this.serializeCheckpoint(contentCheckpoint) }
        : {}),
      groups: groupsCheckpoint?.data ?? {},
      organizationId,
    };
  }

  private async scanAdsAction(
    request: SystemWorkflowActionRequest,
  ): Promise<ExtractionState> {
    const state = this.readState(request.input.state);
    const groups = deserializeGroups(state.groups);
    let cursor = this.toCursor(state.adCheckpoint);
    const checkpointCursor = cursor;
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
            { organizationId: state.organizationId },
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
      if (page.length === 0) break;
      for (const row of page) {
        mergeClassifiedRecords(groups, classifyAdRow(row, checkpointCursor));
      }
      cursor = advanceCursor(page, cursor);
      if (page.length < PATTERN_EXTRACTION_PAGE_SIZE) break;
    }
    return {
      ...state,
      ...(cursor ? { adCursor: this.serializeCursor(cursor) } : {}),
      groups: serializeGroups(groups),
    };
  }

  private async scanContentAction(
    request: SystemWorkflowActionRequest,
  ): Promise<ExtractionState> {
    const state = this.readState(request.input.state);
    const groups = deserializeGroups(state.groups);
    let cursor = this.toCursor(state.contentCheckpoint);
    const checkpointCursor = cursor;
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
            { organizationId: state.organizationId },
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
      if (page.length === 0) break;
      for (const row of page) {
        mergeClassifiedRecords(
          groups,
          classifyContentRow(row, checkpointCursor),
        );
      }
      cursor = advanceCursor(page, cursor);
      if (page.length < PATTERN_EXTRACTION_PAGE_SIZE) break;
    }
    return {
      ...state,
      ...(cursor ? { contentCursor: this.serializeCursor(cursor) } : {}),
      groups: serializeGroups(groups),
    };
  }

  private buildAction(request: SystemWorkflowActionRequest): ExtractionState & {
    items: PatternCandidate[];
  } {
    const state = this.readState(request.input.state);
    const groups = deserializeGroups(state.groups);
    const now = new Date();
    const items = [...groups.values()].flatMap((group) => {
      const privatePattern = buildPatternPayloads([group], now).find(
        (payload) => payload.scope === 'private',
      );
      if (!privatePattern) return [];
      return [
        {
          fingerprint: patternGroupKey(
            group.platform,
            group.industry,
            group.classifiedType,
            group.patternType,
          ),
          organizationId: state.organizationId,
          privatePattern: toUpsertInput(privatePattern),
          sampleSize: group.sampleSize,
          scoreSum: group.scoreSum,
        },
      ];
    });
    return { ...state, items };
  }

  private async persistCandidateAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ promotedPublic: boolean }> {
    const candidate = this.readCandidate(request.input.item);
    if (candidate.organizationId !== request.context.organizationId) {
      throw new Error('Pattern candidate organization does not match workflow');
    }
    const fingerprintHash = createHash('sha256')
      .update(candidate.fingerprint)
      .digest('hex');
    const organizationHash = createHash('sha256')
      .update(candidate.organizationId)
      .digest('hex');
    for (
      let attempt = 1;
      attempt <= MAX_PROMOTION_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.persistCandidateTransaction(
          candidate,
          fingerprintHash,
          organizationHash,
        );
      } catch (error: unknown) {
        if (
          !this.isRetryableConcurrencyFailure(error) ||
          attempt === MAX_PROMOTION_TRANSACTION_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(
          `${this.logContext} retrying concurrent fingerprint promotion`,
          { attempt, fingerprintHash },
        );
      }
    }
    throw new Error('Pattern promotion transaction exhausted attempts');
  }

  private persistCandidateTransaction(
    candidate: PatternCandidate,
    fingerprintHash: string,
    organizationHash: string,
  ): Promise<{ promotedPublic: boolean }> {
    return this.prisma.$transaction(
      async (transaction) => {
        const source = `pattern-fingerprint:${fingerprintHash}`;
        const existing =
          await transaction.patternExtractionCheckpoint.findUnique({
            where: { source },
          });
        const contributions = this.readContributions(existing?.data);
        contributions[organizationHash] = {
          sampleSize: candidate.sampleSize,
          scoreSum: candidate.scoreSum,
        };
        const contributionValues = Object.values(contributions);
        const sampleSize = contributionValues.reduce(
          (sum, contribution) => sum + contribution.sampleSize,
          0,
        );
        const scoreSum = contributionValues.reduce(
          (sum, contribution) => sum + contribution.scoreSum,
          0,
        );
        const now = new Date();
        await transaction.patternExtractionCheckpoint.upsert({
          create: {
            data: { contributions } as Prisma.InputJsonValue,
            lastRunAt: now,
            measuredAt: now,
            source,
            sourceId: organizationHash,
          },
          update: {
            data: { contributions } as Prisma.InputJsonValue,
            lastRunAt: now,
            measuredAt: now,
            sourceId: organizationHash,
          },
          where: { source },
        });
        await this.creativePatternsService.upsertPattern(
          candidate.privatePattern,
          transaction,
        );
        const promotedPublic =
          contributionValues.length >= PATTERN_EXTRACTION_MIN_ORGS_FOR_PUBLIC;
        if (promotedPublic) {
          await this.creativePatternsService.upsertPattern(
            this.publicPattern(candidate, sampleSize, scoreSum, now),
            transaction,
          );
        }
        return { promotedPublic };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async saveAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ persisted: number; status: 'completed' }> {
    const state = this.readState(request.input.state);
    const persistence = this.readRecord(
      request.input.persistence,
      'persistence',
    );
    await Promise.all([
      this.saveCheckpoint(
        this.organizationSource(
          AD_PERFORMANCE_CHECKPOINT_SOURCE,
          state.organizationId,
        ),
        state.adCursor,
        {},
      ),
      this.saveCheckpoint(
        this.organizationSource(
          CONTENT_PERFORMANCE_CHECKPOINT_SOURCE,
          state.organizationId,
        ),
        state.contentCursor,
        {},
      ),
      this.saveCheckpoint(
        this.organizationSource(GROUPS_CHECKPOINT_SOURCE, state.organizationId),
        state.contentCursor ?? state.adCursor,
        state.groups,
      ),
    ]);
    const results = Array.isArray(persistence.results)
      ? persistence.results.length
      : 0;
    this.logger.log(`${this.logContext} completed organization extraction`, {
      organizationId: state.organizationId,
      persisted: results,
    });
    return { persisted: results, status: 'completed' };
  }

  private publicPattern(
    candidate: PatternCandidate,
    sampleSize: number,
    scoreSum: number,
    now: Date,
  ): Record<string, unknown> {
    return {
      ...candidate.privatePattern,
      avgPerformanceScore:
        sampleSize > 0 ? Math.round(scoreSum / sampleSize) : 0,
      computedAt: now,
      description: 'Cross-organization high-performing pattern',
      examples: [],
      organization: candidate.organizationId,
      organizationId: candidate.organizationId,
      sampleSize,
      scope: 'public',
      source: 'both',
      validUntil: new Date(now.getTime() + PUBLIC_PATTERN_TTL_MS),
    };
  }

  private async loadCheckpoint(
    source: string,
  ): Promise<StoredCheckpoint | null> {
    const row = await this.prisma.patternExtractionCheckpoint.findUnique({
      select: { data: true, measuredAt: true, sourceId: true },
      where: { source },
    });
    return row
      ? {
          data: readObjectRecord(row.data),
          measuredAt: row.measuredAt,
          sourceId: row.sourceId,
        }
      : null;
  }

  private async saveCheckpoint(
    source: string,
    cursor: SerializedCursor | undefined,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!cursor) return;
    const measuredAt = this.parseDate(cursor.measuredAt, 'measuredAt');
    await this.prisma.patternExtractionCheckpoint.upsert({
      create: {
        data: data as Prisma.InputJsonValue,
        lastRunAt: new Date(),
        measuredAt,
        source,
        sourceId: cursor.sourceId,
      },
      update: {
        data: data as Prisma.InputJsonValue,
        lastRunAt: new Date(),
        measuredAt,
        sourceId: cursor.sourceId,
      },
      where: { source },
    });
  }

  private readState(value: unknown): ExtractionState {
    const state = this.readRecord(value, 'state');
    return {
      ...(state.adCheckpoint
        ? {
            adCheckpoint: this.readSerializedCheckpoint(state.adCheckpoint),
          }
        : {}),
      ...(state.adCursor
        ? { adCursor: this.readSerializedCursor(state.adCursor) }
        : {}),
      ...(state.contentCheckpoint
        ? {
            contentCheckpoint: this.readSerializedCheckpoint(
              state.contentCheckpoint,
            ),
          }
        : {}),
      ...(state.contentCursor
        ? { contentCursor: this.readSerializedCursor(state.contentCursor) }
        : {}),
      groups: this.readRecord(state.groups, 'groups'),
      organizationId: this.requiredString(
        state.organizationId,
        'organizationId',
      ),
    };
  }

  private readCandidate(value: unknown): PatternCandidate {
    const candidate = this.readRecord(value, 'candidate');
    return {
      fingerprint: this.requiredString(candidate.fingerprint, 'fingerprint'),
      organizationId: this.requiredString(
        candidate.organizationId,
        'organizationId',
      ),
      privatePattern: this.readRecord(
        candidate.privatePattern,
        'privatePattern',
      ),
      sampleSize: this.requiredNumber(candidate.sampleSize, 'sampleSize'),
      scoreSum: this.requiredNumber(candidate.scoreSum, 'scoreSum'),
    };
  }

  private readContributions(
    value: unknown,
  ): Record<string, FingerprintContribution> {
    const data = readObjectRecord(value);
    const stored = readObjectRecord(data.contributions);
    return Object.fromEntries(
      Object.entries(stored).flatMap(([key, contribution]) => {
        const record = readObjectRecord(contribution);
        const sampleSize = this.optionalNumber(record.sampleSize);
        const scoreSum = this.optionalNumber(record.scoreSum);
        return sampleSize === undefined || scoreSum === undefined
          ? []
          : [[key, { sampleSize, scoreSum }]];
      }),
    );
  }

  private serializeCheckpoint(
    checkpoint: StoredCheckpoint,
  ): SerializedCheckpoint {
    return {
      data: checkpoint.data,
      measuredAt: checkpoint.measuredAt.toISOString(),
      sourceId: checkpoint.sourceId,
    };
  }

  private serializeCursor(cursor: PatternExtractionCursor): SerializedCursor {
    return {
      measuredAt: cursor.measuredAt.toISOString(),
      sourceId: cursor.sourceId,
    };
  }

  private readSerializedCheckpoint(value: unknown): SerializedCheckpoint {
    const checkpoint = this.readRecord(value, 'checkpoint');
    return {
      data: this.readRecord(checkpoint.data, 'checkpoint data'),
      measuredAt: this.requiredString(checkpoint.measuredAt, 'measuredAt'),
      sourceId: this.requiredString(checkpoint.sourceId, 'sourceId'),
    };
  }

  private readSerializedCursor(value: unknown): SerializedCursor {
    const cursor = this.readRecord(value, 'cursor');
    return {
      measuredAt: this.requiredString(cursor.measuredAt, 'measuredAt'),
      sourceId: this.requiredString(cursor.sourceId, 'sourceId'),
    };
  }

  private toCursor(
    checkpoint: SerializedCheckpoint | undefined,
  ): PatternExtractionCursor | null {
    return checkpoint
      ? {
          measuredAt: this.parseDate(checkpoint.measuredAt, 'measuredAt'),
          sourceId: checkpoint.sourceId,
        }
      : null;
  }

  private organizationSource(base: string, organizationId: string): string {
    return `${base}:${organizationId}`;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Pattern extraction requires valid ${field}`);
    }
    return date;
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Pattern extraction requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private requiredNumber(value: unknown, field: string): number {
    const resolved = this.optionalNumber(value);
    if (resolved === undefined) {
      throw new Error(`Pattern extraction requires numeric ${field}`);
    }
    return resolved;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Pattern extraction requires ${field}`);
    }
    return value.trim();
  }

  private isRetryableConcurrencyFailure(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }
    const code = (error as { code?: unknown }).code;
    return code === 'P2002' || code === 'P2034';
  }
}
