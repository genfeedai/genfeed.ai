import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  buildClipContinuityFailureWorkflowDefinition,
  buildClipContinuityQaWorkflowDefinition,
  buildClipContinuityWorkflowDefinition,
  CLIP_CONTINUITY_ACTION_IDS,
  CLIP_CONTINUITY_FAILURE_WORKFLOW_ID,
  CLIP_CONTINUITY_WORKFLOW_ID,
} from '@api/collections/clip-projects/services/clip-continuity-workflow-definition';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createNotAssessedContinuityDimension,
  VIDEO_CONTINUITY_QA_SCHEMA_VERSION,
  type VideoContinuityClipFinding,
  type VideoContinuityQaReport,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type CanonicalReference = {
  assetId: string;
  role: 'character' | 'product';
  url: string;
};

type ClipDescriptor = {
  id: string;
  qaIndex?: number;
  status: string;
  videoUrl?: string;
};

@Injectable()
export class ClipContinuityWorkflowService implements OnModuleInit {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly clipResults: ClipResultsService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(CLIP_CONTINUITY_ACTION_IDS.BEGIN, (request) =>
      this.begin(request),
    );
    this.runner.registerAction(CLIP_CONTINUITY_ACTION_IDS.FAIL, (request) =>
      this.fail(request),
    );
    this.runner.registerAction(
      CLIP_CONTINUITY_ACTION_IDS.PERSIST_REPORT,
      (request) => this.persistReport(request),
    );
    this.runner.registerWorkflow(buildClipContinuityWorkflowDefinition());
    this.runner.registerWorkflow(buildClipContinuityQaWorkflowDefinition());
    this.runner.registerWorkflow(
      buildClipContinuityFailureWorkflowDefinition(),
    );
  }

  async queueIfReady(project: ClipProjectDocument): Promise<boolean> {
    const projectId = this.requiredString(project.id, 'projectId');
    const organizationId = this.requiredString(
      project.organizationId,
      'organizationId',
    );
    const generationWorkflowExecutionId = this.readString(
      project.workflowExecutionId,
    );
    if (
      !generationWorkflowExecutionId ||
      project.continuityQaStatus !== 'pending' ||
      !['completed', 'partially-completed'].includes(String(project.status))
    ) {
      return false;
    }

    const execution = await this.prisma.workflowExecution.findFirst({
      include: { nodeResults: true },
      where: scopedWhere(organizationId, {
        id: generationWorkflowExecutionId,
      }),
    });
    if (!execution) {
      throw new Error(
        `Clip continuity cannot resolve generation execution ${generationWorkflowExecutionId}`,
      );
    }
    const executionResult = this.readRecord(execution.result);
    const persistedInputValues = this.readRecord(executionResult.inputValues);
    const planResult = execution.nodeResults.find(
      (result) => result.nodeId === 'plan-generation',
    );
    const planOutput = this.readRecord(planResult?.output);
    const baseInput = this.readRecord(planOutput.baseInput);
    const request = this.readRecord(
      persistedInputValues.request ?? baseInput.request,
    );
    const references = this.readReferences(request.runReferences);
    const clipRows = await this.clipResults.findByProject(
      projectId,
      organizationId,
    );
    const orderedClipIds = [...clipRows]
      .sort(
        (left, right) =>
          this.readClipIndex(left.index) - this.readClipIndex(right.index),
      )
      .map((clip) => clip.id);
    if (orderedClipIds.length === 0 && project.readyClipCount > 0) {
      throw new Error(
        `Clip continuity found no persisted clip results for generation execution ${generationWorkflowExecutionId}`,
      );
    }
    const clipsById = new Map(clipRows.map((clip) => [clip.id, clip]));
    const hasCanonicalReferences = references.length > 0;
    let qaIndex = 0;
    const descriptors: ClipDescriptor[] = orderedClipIds.flatMap((id) => {
      const clip = clipsById.get(id);
      if (!clip) {
        return [];
      }
      const videoUrl =
        this.readString(clip.captionedVideoUrl) ??
        this.readString(clip.videoUrl);
      const descriptor: ClipDescriptor = {
        id,
        status: String(clip.status),
        ...(videoUrl && hasCanonicalReferences
          ? { qaIndex: qaIndex++, videoUrl }
          : videoUrl
            ? { videoUrl }
            : {}),
      };
      return [descriptor];
    });
    const referenceAssetIds = {
      character: references
        .filter((reference) => reference.role === 'character')
        .map((reference) => reference.assetId),
      product: references
        .filter((reference) => reference.role === 'product')
        .map((reference) => reference.assetId),
    };
    const workflowInputValues: Record<string, unknown> = {
      baseInput: {
        characterReferenceUrls: references
          .filter((reference) => reference.role === 'character')
          .map((reference) => reference.url),
        productReferenceUrls: references
          .filter((reference) => reference.role === 'product')
          .map((reference) => reference.url),
      },
      clipDescriptors: descriptors,
      generationWorkflowExecutionId,
      items: descriptors.flatMap((descriptor) =>
        descriptor.qaIndex !== undefined && descriptor.videoUrl
          ? [descriptor.videoUrl]
          : [],
      ),
      projectId,
      referenceAssetIds,
    };

    const claimed = await this.prisma.clipProject.updateMany({
      data: { continuityQaStatus: 'queued' },
      where: scopedWhere(organizationId, {
        continuityQaStatus: 'pending',
        id: projectId,
        status: { in: ['completed', 'partially-completed'] },
      }),
    });
    if (claimed.count !== 1) {
      return false;
    }
    try {
      await this.queue.queueSystemWorkflow(
        {
          actionType: 'clip-continuity',
          canonicalId: CLIP_CONTINUITY_WORKFLOW_ID,
          inputValues: workflowInputValues,
          metadata: { generationWorkflowExecutionId, projectId },
          organizationId,
          source: 'clip-generation-completion',
          userId: this.readString(project.userId) ?? undefined,
        },
        `clip-continuity-${projectId}-${generationWorkflowExecutionId}`,
        {
          failureWorkflow: {
            canonicalId: CLIP_CONTINUITY_FAILURE_WORKFLOW_ID,
            inputValues: { projectId },
          },
        },
      );
      return true;
    } catch (error: unknown) {
      await this.prisma.clipProject.updateMany({
        data: { continuityQaStatus: 'pending' },
        where: scopedWhere(organizationId, {
          continuityQaStatus: 'queued',
          id: projectId,
        }),
      });
      throw error;
    }
  }

  private async begin(request: SystemWorkflowActionRequest): Promise<{
    projectId: string;
    status: 'running';
  }> {
    const projectId = this.requiredString(request.input.projectId, 'projectId');
    const updated = await this.prisma.clipProject.updateMany({
      data: {
        continuityQaStatus: 'running',
        continuityWorkflowExecutionId: request.provenance.executionId,
      },
      where: scopedWhere(request.context.organizationId, {
        continuityQaStatus: { in: ['failed', 'queued', 'running'] },
        id: projectId,
      }),
    });
    if (updated.count !== 1) {
      throw new Error(`Clip continuity claim failed for project ${projectId}`);
    }
    return { projectId, status: 'running' };
  }

  private async fail(request: SystemWorkflowActionRequest): Promise<{
    projectId: string;
    status: 'failed';
  }> {
    const projectId = this.requiredString(request.input.projectId, 'projectId');
    const updated = await this.prisma.clipProject.updateMany({
      data: { continuityQaStatus: 'failed' },
      where: scopedWhere(request.context.organizationId, {
        continuityQaStatus: { in: ['failed', 'queued', 'running'] },
        id: projectId,
      }),
    });
    if (updated.count !== 1) {
      throw new Error(`Clip continuity failure projection missed ${projectId}`);
    }
    return { projectId, status: 'failed' };
  }

  private async persistReport(
    request: SystemWorkflowActionRequest,
  ): Promise<VideoContinuityQaReport> {
    const projectId = this.requiredString(request.input.projectId, 'projectId');
    const generationWorkflowExecutionId = this.requiredString(
      request.input.generationWorkflowExecutionId,
      'generationWorkflowExecutionId',
    );
    const descriptors = this.readClipDescriptors(request.input.clipDescriptors);
    const referenceAssetIds = this.readReferenceAssetIds(
      request.input.referenceAssetIds,
    );
    const qaBatch = this.readRecord(request.input.qaBatch);
    const qaReportsByIndex = (
      Array.isArray(qaBatch.results) ? qaBatch.results : []
    )
      .map((entry) => this.readRecord(entry).result)
      .map((value) => this.readContinuityReport(value));
    const qaReports = qaReportsByIndex.filter(
      (value): value is VideoContinuityQaReport => value !== undefined,
    );
    const findings = descriptors.map((descriptor, index) =>
      this.resolveFinding(qaReportsByIndex, descriptor, index),
    );
    const skipReason = qaReports.find(
      (report) => report.skipReason,
    )?.skipReason;
    const hasReferences =
      referenceAssetIds.character.length > 0 ||
      referenceAssetIds.product.length > 0;
    const report: VideoContinuityQaReport = {
      clips: findings,
      completedAt: new Date().toISOString(),
      ...(qaReports.find((item) => item.modelKey)?.modelKey
        ? { modelKey: qaReports.find((item) => item.modelKey)?.modelKey }
        : {}),
      projectId,
      referenceAssetIds,
      runId: request.provenance.executionId,
      schemaVersion: VIDEO_CONTINUITY_QA_SCHEMA_VERSION,
      ...(!hasReferences
        ? { skipReason: 'canonical_references_unavailable' as const }
        : skipReason
          ? { skipReason }
          : {}),
      status:
        !hasReferences ||
        (qaReports.length > 0 &&
          qaReports.every((item) => item.status === 'skipped'))
          ? 'skipped'
          : findings.some((finding) => finding.errors.length > 0)
            ? 'partial'
            : 'completed',
      summary: this.summarize(findings),
    };
    await this.attachReport(
      projectId,
      generationWorkflowExecutionId,
      request.context.organizationId,
      report,
    );
    return report;
  }

  private async attachReport(
    projectId: string,
    generationWorkflowExecutionId: string,
    organizationId: string,
    report: VideoContinuityQaReport,
  ): Promise<void> {
    const [tasks, batchItems] = await Promise.all([
      this.prisma.task.findMany({
        select: { decomposition: true, id: true },
        where: scopedWhere(organizationId, { projectId }),
      }),
      this.prisma.batchItem.findMany({
        select: { data: true, id: true },
        where: scopedWhere(organizationId, {
          OR: [
            {
              data: {
                equals: generationWorkflowExecutionId,
                path: ['workflowExecutionId'],
              },
            },
            { data: { equals: projectId, path: ['clipProjectId'] } },
          ],
        }),
      }),
    ]);
    await Promise.all([
      ...tasks.map((task) =>
        this.prisma.task.updateMany({
          data: {
            decomposition: {
              ...this.readRecord(task.decomposition),
              continuityQa: report,
            } as unknown as Prisma.InputJsonValue,
          },
          where: scopedWhere(organizationId, { id: task.id }),
        }),
      ),
      ...batchItems.map((item) =>
        this.prisma.batchItem.updateMany({
          data: {
            data: {
              ...this.readRecord(item.data),
              continuityQa: report,
            } as unknown as Prisma.InputJsonValue,
          },
          where: scopedWhere(organizationId, { id: item.id }),
        }),
      ),
    ]);
    const continuityQaStatus =
      report.status === 'skipped' ? 'skipped' : 'completed';
    const updatedProject = await this.prisma.$executeRaw`
      UPDATE "clip_projects"
      SET
        "config" = jsonb_set(
          COALESCE("config", '{}'::jsonb),
          '{continuityQa}',
          ${JSON.stringify(report)}::jsonb,
          true
        ),
        "continuityQaStatus" = ${continuityQaStatus},
        "updatedAt" = NOW()
      WHERE "id" = ${projectId}
        AND "organizationId" = ${organizationId}
        AND "isDeleted" = false
    `;
    if (updatedProject !== 1) {
      throw new Error(`Clip project ${projectId} no longer exists`);
    }
    this.logger.log('Clip continuity workflow completed', {
      projectId,
      status: report.status,
    });
  }

  private resolveFinding(
    qaReports: Array<VideoContinuityQaReport | undefined>,
    descriptor: ClipDescriptor,
    index: number,
  ): VideoContinuityClipFinding {
    if (descriptor.qaIndex !== undefined) {
      const report = qaReports[descriptor.qaIndex];
      const finding = report?.clips[0];
      if (finding) {
        return {
          ...finding,
          clipId: descriptor.id,
          clipIndex: index,
          ...(descriptor.videoUrl ? { videoUrl: descriptor.videoUrl } : {}),
        };
      }
      if (report?.status === 'skipped') {
        return this.createUnassessedFinding(
          descriptor,
          index,
          undefined,
          `Continuity QA was skipped: ${report.skipReason ?? 'unavailable'}.`,
        );
      }
      return this.createUnassessedFinding(
        descriptor,
        index,
        'MODEL_FAILED',
        'The video QA action returned no continuity report.',
      );
    }
    if (descriptor.videoUrl) {
      return this.createUnassessedFinding(
        descriptor,
        index,
        undefined,
        'No canonical character or product references were available.',
      );
    }
    return this.createUnassessedFinding(
      descriptor,
      index,
      'FRAME_EXTRACTION_FAILED',
      'The terminal clip has no generated video URL.',
    );
  }

  private createUnassessedFinding(
    descriptor: ClipDescriptor,
    index: number,
    errorCode: 'FRAME_EXTRACTION_FAILED' | 'MODEL_FAILED' | undefined,
    message: string,
  ): VideoContinuityClipFinding {
    const unavailable = createNotAssessedContinuityDimension(message);
    return {
      character: unavailable,
      clipId: descriptor.id,
      clipIndex: index,
      errors: errorCode ? [{ code: errorCode, message }] : [],
      evidenceFrames: [],
      outfit: unavailable,
      product: unavailable,
      ...(descriptor.videoUrl ? { videoUrl: descriptor.videoUrl } : {}),
    };
  }

  private readContinuityReport(
    value: unknown,
  ): VideoContinuityQaReport | undefined {
    const record = this.readRecord(value);
    const candidate = this.readRecord(record.continuityQa);
    const report =
      candidate.schemaVersion === VIDEO_CONTINUITY_QA_SCHEMA_VERSION
        ? candidate
        : record;
    return report.schemaVersion === VIDEO_CONTINUITY_QA_SCHEMA_VERSION
      ? (report as unknown as VideoContinuityQaReport)
      : undefined;
  }

  private readClipDescriptors(value: unknown): ClipDescriptor[] {
    if (!Array.isArray(value)) {
      throw new Error('Clip continuity workflow requires clipDescriptors');
    }
    return value.map((item) => {
      const record = this.readRecord(item);
      const id = this.requiredString(record.id, 'clipDescriptors.id');
      const qaIndex =
        typeof record.qaIndex === 'number' && Number.isInteger(record.qaIndex)
          ? record.qaIndex
          : undefined;
      const videoUrl = this.readString(record.videoUrl) ?? undefined;
      return {
        id,
        ...(qaIndex !== undefined ? { qaIndex } : {}),
        status: this.readString(record.status) ?? 'unknown',
        ...(videoUrl ? { videoUrl } : {}),
      };
    });
  }

  private readReferenceAssetIds(value: unknown): {
    character: string[];
    product: string[];
  } {
    const record = this.readRecord(value);
    return {
      character: this.readStringArray(record.character),
      product: this.readStringArray(record.product),
    };
  }

  private readReferences(value: unknown): CanonicalReference[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      const record = this.readRecord(item);
      const assetId = this.readString(record.assetId);
      const role = this.readString(record.role);
      const url = this.readString(record.url);
      return assetId && url && (role === 'character' || role === 'product')
        ? [{ assetId, role, url }]
        : [];
    });
  }

  private summarize(findings: VideoContinuityClipFinding[]) {
    return {
      assessedClipCount: findings.filter((finding) =>
        [finding.character, finding.outfit, finding.product].some(
          (dimension) => dimension.verdict !== 'not_assessed',
        ),
      ).length,
      driftClipCount: findings.filter((finding) =>
        [finding.character, finding.outfit, finding.product].some(
          (dimension) => dimension.verdict === 'drift',
        ),
      ).length,
      errorClipCount: findings.filter((finding) => finding.errors.length > 0)
        .length,
      totalClipCount: findings.length,
    };
  }

  private requiredString(value: unknown, field: string): string {
    const result = this.readString(value);
    if (!result) {
      throw new Error(`Clip continuity workflow requires ${field}`);
    }
    return result;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
      : [];
  }

  private readClipIndex(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.MAX_SAFE_INTEGER;
  }
}
