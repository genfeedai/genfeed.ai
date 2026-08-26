import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { isTerminalClipStatus } from '@api/collections/clip-shared/clip-terminal-contract.util';
import {
  CLIP_ORCHESTRATOR_EVENTS,
  type ClipContinuityQaRequestedEvent,
} from '@api/services/clip-orchestrator/clip-orchestrator.events';
import {
  ClipOrchestratorService,
  type ClipRun,
} from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipOrchestratorStateStore } from '@api/services/clip-orchestrator/clip-orchestrator-state.store';
import { ClipRunObserverService } from '@api/services/clip-orchestrator/clip-run-observer.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createNotAssessedContinuityDimension,
  VIDEO_CONTINUITY_QA_SCHEMA_VERSION,
  type VideoContinuityClipFinding,
  type VideoContinuityDimensionFinding,
  type VideoContinuityQaReport,
  type VideoContinuityVerdict,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

const PENDING_NAMESPACE = 'continuity-qa-pending';
const PENDING_SET = 'runs';
const VISION_FEATURES = new Set([
  'image-input',
  'image_input',
  'multimodal',
  'vision',
]);
const KNOWN_VISION_MODEL_PREFIXES = [
  'anthropic/',
  'google/',
  'moonshotai/',
  'openai/',
  'x-ai/',
];

interface CanonicalReferences {
  character: Array<{ assetId: string; url: string }>;
  product: Array<{ assetId: string; url: string }>;
}

interface VisionModel {
  id: string;
  key: string;
}

@Injectable()
export class ClipContinuityFinalizationService {
  constructor(
    private readonly orchestrator: ClipOrchestratorService,
    private readonly stateStore: ClipOrchestratorStateStore,
    private readonly observer: ClipRunObserverService,
    private readonly clipResults: ClipResultsService,
    private readonly filesClient: FilesClientService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(CLIP_ORCHESTRATOR_EVENTS.CONTINUITY_QA_REQUESTED)
  async enqueue(event: ClipContinuityQaRequestedEvent): Promise<void> {
    await this.stateStore.addMember(
      PENDING_NAMESPACE,
      PENDING_SET,
      event.runId,
    );
  }

  @Interval(15_000)
  async processPendingRuns(): Promise<void> {
    const runIds = await this.stateStore.getMembers(
      PENDING_NAMESPACE,
      PENDING_SET,
    );
    await Promise.all(runIds.map((runId) => this.processRun(runId)));
  }

  async processRun(runId: string): Promise<void> {
    const run = await this.orchestrator.getRun(runId);
    if (!run || !isApprovedHookPlan(run.metadata?.hookApproval)) {
      await this.removePending(runId);
      return;
    }
    if (isContinuityReport(run.metadata?.continuityQa)) {
      await this.removePending(runId);
      return;
    }

    const projectClips = await this.clipResults.findByProject(
      run.projectId,
      run.organizationId,
    );
    const expectedClipCount = readExpectedClipCount(run.metadata?.hookApproval);
    const clips = selectRunClips(projectClips, run, expectedClipCount);
    if (
      clips.length < expectedClipCount ||
      clips.some((clip) => !isTerminalClipStatus(String(clip.status)))
    ) {
      return;
    }

    const claimed = await this.stateStore.claim(
      'continuity-qa-claims',
      run.id,
      10 * 60,
    );
    if (!claimed) return;

    await this.observer.emitStepProgress(run.id, 'continuity-qa', 'running', {
      clipCount: clips.length,
    });

    try {
      const report = await this.buildReport(run, clips);
      await this.attachReport(run, report);
      await this.observer.emitStepProgress(
        run.id,
        'continuity-qa',
        report.status === 'skipped' ? 'skipped' : 'done',
        {
          driftClipCount: report.summary.driftClipCount,
          errorClipCount: report.summary.errorClipCount,
          skipReason: report.skipReason,
        },
      );
      await this.removePending(run.id);
    } catch (error: unknown) {
      this.logger.error(
        'ClipContinuityFinalizationService: continuity finalization failed',
        error,
      );
      await this.observer.emitStepProgress(run.id, 'continuity-qa', 'failed', {
        errorMessage:
          error instanceof Error ? error.message : 'Continuity QA failed',
        retryable: true,
      });
    }
  }

  private async buildReport(
    run: ClipRun,
    clips: ClipResultDocument[],
  ): Promise<VideoContinuityQaReport> {
    const references = readCanonicalReferences(run);
    if (references.character.length === 0 && references.product.length === 0) {
      return this.buildSkippedReport(
        run,
        clips,
        references,
        'canonical_references_unavailable',
      );
    }

    const model = await this.resolveVisionModel(run.organizationId);
    if (!model) {
      return this.buildSkippedReport(
        run,
        clips,
        references,
        'vision_model_unavailable',
      );
    }

    const findings: VideoContinuityClipFinding[] = [];
    for (const [position, clip] of clips.entries()) {
      findings.push(
        await this.inspectClip(run, clip, position, references, model),
      );
    }

    return {
      clips: findings,
      completedAt: new Date().toISOString(),
      modelKey: model.key,
      projectId: run.projectId,
      referenceAssetIds: referenceIds(references),
      runId: run.id,
      schemaVersion: VIDEO_CONTINUITY_QA_SCHEMA_VERSION,
      status: findings.some((finding) => finding.errors.length > 0)
        ? 'partial'
        : 'completed',
      summary: summarizeFindings(findings),
    };
  }

  private buildSkippedReport(
    run: ClipRun,
    clips: ClipResultDocument[],
    references: CanonicalReferences,
    skipReason: NonNullable<VideoContinuityQaReport['skipReason']>,
  ): VideoContinuityQaReport {
    const explanation =
      skipReason === 'vision_model_unavailable'
        ? 'No configured vision-capable model was available.'
        : 'No canonical character or product references were available.';
    const findings = clips.map((clip, position) =>
      createUnassessedClipFinding(clip, position, explanation),
    );
    return {
      clips: findings,
      completedAt: new Date().toISOString(),
      projectId: run.projectId,
      referenceAssetIds: referenceIds(references),
      runId: run.id,
      schemaVersion: VIDEO_CONTINUITY_QA_SCHEMA_VERSION,
      skipReason,
      status: 'skipped',
      summary: summarizeFindings(findings),
    };
  }

  private async inspectClip(
    run: ClipRun,
    clip: ClipResultDocument,
    position: number,
    references: CanonicalReferences,
    model: VisionModel,
  ): Promise<VideoContinuityClipFinding> {
    const videoUrl = readClipVideoUrl(clip);
    if (!videoUrl) {
      return createExtractionErrorFinding(
        clip,
        position,
        'The terminal clip has no generated video URL.',
      );
    }

    let contactSheetUrl: string;
    try {
      const inspection = await this.filesClient.inspectVideoQa({
        blackDurationSeconds: 0.5,
        freezeDurationSeconds: 2,
        isContactSheetEnabled: true,
        videoUrl,
      });
      if (!inspection.contactSheetUrl) {
        return createExtractionErrorFinding(
          clip,
          position,
          'Frame extraction completed without a contact sheet.',
        );
      }
      contactSheetUrl = inspection.contactSheetUrl;
    } catch (error: unknown) {
      return createExtractionErrorFinding(
        clip,
        position,
        error instanceof Error ? error.message : 'Frame extraction failed',
      );
    }

    try {
      const response = await this.llmDispatcher.chatCompletion(
        {
          max_tokens: 650,
          messages: [
            {
              content:
                'You are a visual continuity QA evaluator. Return strict JSON only. Never recommend rejection or regeneration.',
              role: 'system',
            },
            {
              content: buildVisionContent(contactSheetUrl, references),
              role: 'user',
            },
          ],
          model: model.key,
          temperature: 0,
        },
        run.organizationId,
      );
      const content = response.choices?.[0]?.message?.content;
      return parseVisionFinding(content, clip, position, contactSheetUrl);
    } catch (error: unknown) {
      return createModelErrorFinding(
        clip,
        position,
        contactSheetUrl,
        error instanceof Error ? error.message : 'Vision model failed',
      );
    }
  }

  private async resolveVisionModel(
    organizationId: string,
  ): Promise<VisionModel | undefined> {
    const [settings, models] = await Promise.all([
      this.prisma.organizationSetting.findUnique({
        select: { defaultModel: true, enabledModelIds: true },
        where: { organizationId },
      }),
      this.prisma.model.findMany({
        orderBy: [{ cost: 'asc' }, { key: 'asc' }],
        select: {
          capabilities: true,
          description: true,
          id: true,
          key: true,
          recommendedFor: true,
          supportsFeatures: true,
        },
        where: {
          category: 'text',
          isActive: true,
          isDeleted: false,
          isLegacy: false,
          OR: [{ organizationId: null }, { organizationId }],
        },
      }),
    ]);
    const enabled = new Set(settings?.enabledModelIds ?? []);
    if (settings?.defaultModel) enabled.add(settings.defaultModel);
    if (enabled.size === 0) return undefined;
    const candidates = models.filter(
      (model) =>
        supportsVision(model) &&
        (enabled.has(model.id) || enabled.has(model.key)),
    );
    return (
      candidates.find((model) => model.key === settings?.defaultModel) ??
      candidates[0]
    );
  }

  private async attachReport(
    run: ClipRun,
    report: VideoContinuityQaReport,
  ): Promise<void> {
    await this.orchestrator.updateMetadata(run.id, { continuityQa: report });

    const [tasks, batchItems] = await Promise.all([
      this.prisma.task.findMany({
        select: { decomposition: true, id: true },
        where: scopedWhere(run.organizationId, { projectId: run.projectId }),
      }),
      this.prisma.batchItem.findMany({
        select: { data: true, id: true },
        where: scopedWhere(run.organizationId, {
          OR: [
            { data: { equals: run.id, path: ['clipRunId'] } },
            { data: { equals: run.id, path: ['contentRunId'] } },
            { data: { equals: run.projectId, path: ['clipProjectId'] } },
          ],
        }),
      }),
    ]);

    await Promise.all([
      ...tasks.map((task) =>
        this.prisma.task.updateMany({
          data: {
            decomposition: {
              ...readRecord(task.decomposition),
              continuityQa: report,
            } as unknown as Prisma.InputJsonValue,
          },
          where: scopedWhere(run.organizationId, { id: task.id }),
        }),
      ),
      ...batchItems.map((item) =>
        this.prisma.batchItem.updateMany({
          data: {
            data: {
              ...readRecord(item.data),
              continuityQa: report,
            } as unknown as Prisma.InputJsonValue,
          },
          where: scopedWhere(run.organizationId, { id: item.id }),
        }),
      ),
    ]);
  }

  private async removePending(runId: string): Promise<void> {
    await this.stateStore.removeMember(PENDING_NAMESPACE, PENDING_SET, runId);
  }
}

function isApprovedHookPlan(value: unknown): boolean {
  return readRecord(value).phase === 'approved';
}

function readExpectedClipCount(value: unknown): number {
  const remainingInput = readRecord(readRecord(value).remainingInput);
  const highlights = remainingInput.highlights;
  return 1 + (Array.isArray(highlights) ? highlights.length : 0);
}

function selectRunClips(
  clips: ClipResultDocument[],
  run: ClipRun,
  expectedClipCount: number,
): ClipResultDocument[] {
  return clips
    .filter((clip) => {
      const createdAt = clip.createdAt;
      if (!(createdAt instanceof Date) && typeof createdAt !== 'string') {
        return true;
      }
      return new Date(createdAt).getTime() >= run.createdAt.getTime();
    })
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();
      return leftTime - rightTime;
    })
    .slice(0, expectedClipCount);
}

function readCanonicalReferences(run: ClipRun): CanonicalReferences {
  const references: CanonicalReferences = { character: [], product: [] };
  for (const reference of run.runReferences) {
    const record = reference as unknown as Record<string, unknown>;
    if (typeof record.url !== 'string') continue;
    if (reference.role === 'character') {
      references.character.push({
        assetId: reference.assetId,
        url: record.url,
      });
    } else if (reference.role === 'product') {
      references.product.push({ assetId: reference.assetId, url: record.url });
    }
  }
  return references;
}

function referenceIds(references: CanonicalReferences) {
  return {
    character: references.character.map((reference) => reference.assetId),
    product: references.product.map((reference) => reference.assetId),
  };
}

function readClipVideoUrl(clip: ClipResultDocument): string | undefined {
  for (const value of [clip.captionedVideoUrl, clip.videoUrl]) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function createUnassessedClipFinding(
  clip: ClipResultDocument,
  position: number,
  summary: string,
): VideoContinuityClipFinding {
  const dimension = createNotAssessedContinuityDimension(summary);
  return {
    character: dimension,
    clipId: clip.id,
    clipIndex: position,
    errors: [],
    evidenceFrames: [],
    outfit: dimension,
    product: dimension,
    ...(readClipVideoUrl(clip) ? { videoUrl: readClipVideoUrl(clip) } : {}),
  };
}

function createExtractionErrorFinding(
  clip: ClipResultDocument,
  position: number,
  message: string,
): VideoContinuityClipFinding {
  return {
    ...createUnassessedClipFinding(clip, position, message),
    errors: [{ code: 'FRAME_EXTRACTION_FAILED', message }],
  };
}

function createModelErrorFinding(
  clip: ClipResultDocument,
  position: number,
  contactSheetUrl: string,
  message: string,
): VideoContinuityClipFinding {
  return {
    ...createUnassessedClipFinding(clip, position, message),
    errors: [{ code: 'MODEL_FAILED', message }],
    evidenceFrames: [{ kind: 'contact_sheet', url: contactSheetUrl }],
  };
}

function buildVisionContent(
  contactSheetUrl: string,
  references: CanonicalReferences,
) {
  const content: Array<{
    image_url?: { url: string };
    text?: string;
    type: string;
  }> = [
    {
      text: [
        'Compare the first image (generated clip contact sheet) with the canonical reference images that follow.',
        `Character references: ${references.character.length}. Product references: ${references.product.length}.`,
        'Return {"character":{"verdict":"consistent|drift|uncertain|not_assessed","confidence":0..1|null,"summary":"..."},"outfit":{...},"product":{...}}.',
        'Outfit is assessed relative to character references. Use not_assessed when the dimension or reference is absent.',
      ].join('\n'),
      type: 'text',
    },
    { image_url: { url: contactSheetUrl }, type: 'image_url' },
  ];
  for (const reference of [...references.character, ...references.product]) {
    content.push({ image_url: { url: reference.url }, type: 'image_url' });
  }
  return content;
}

function parseVisionFinding(
  raw: string | null | undefined,
  clip: ClipResultDocument,
  position: number,
  contactSheetUrl: string,
): VideoContinuityClipFinding {
  try {
    const parsed = JSON.parse(
      (raw ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    ) as Record<string, unknown>;
    return {
      character: parseDimension(parsed.character),
      clipId: clip.id,
      clipIndex: position,
      errors: [],
      evidenceFrames: [{ kind: 'contact_sheet', url: contactSheetUrl }],
      outfit: parseDimension(parsed.outfit),
      product: parseDimension(parsed.product),
      ...(readClipVideoUrl(clip) ? { videoUrl: readClipVideoUrl(clip) } : {}),
    };
  } catch {
    return {
      ...createModelErrorFinding(
        clip,
        position,
        contactSheetUrl,
        'Vision model returned an invalid structured response.',
      ),
      errors: [
        {
          code: 'MODEL_RESPONSE_INVALID',
          message: 'Vision model returned an invalid structured response.',
        },
      ],
    };
  }
}

function parseDimension(value: unknown): VideoContinuityDimensionFinding {
  const record = readRecord(value);
  const verdicts: VideoContinuityVerdict[] = [
    'consistent',
    'drift',
    'uncertain',
    'not_assessed',
  ];
  const verdict = verdicts.includes(record.verdict as VideoContinuityVerdict)
    ? (record.verdict as VideoContinuityVerdict)
    : 'uncertain';
  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : null;
  return {
    confidence,
    summary:
      typeof record.summary === 'string'
        ? record.summary
        : 'No explanation was returned.',
    verdict,
  };
}

function summarizeFindings(findings: VideoContinuityClipFinding[]) {
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

function supportsVision(model: {
  capabilities: string[];
  description: string | null;
  key: string;
  recommendedFor: string[];
  supportsFeatures: string[];
}): boolean {
  const features = [
    ...model.capabilities,
    ...model.recommendedFor,
    ...model.supportsFeatures,
  ].map((feature) => feature.toLowerCase());
  return (
    features.some((feature) => VISION_FEATURES.has(feature)) ||
    /\b(multimodal|vision)\b/i.test(model.description ?? '') ||
    KNOWN_VISION_MODEL_PREFIXES.some((prefix) => model.key.startsWith(prefix))
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isContinuityReport(value: unknown): value is VideoContinuityQaReport {
  const record = readRecord(value);
  return record.schemaVersion === VIDEO_CONTINUITY_QA_SCHEMA_VERSION;
}
