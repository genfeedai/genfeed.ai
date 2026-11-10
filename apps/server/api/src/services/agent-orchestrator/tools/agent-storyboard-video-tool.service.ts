import { StoryboardAssetBibleService } from '@api/collections/content-runs/services/storyboard-asset-bible.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { StoryboardShotQaService } from '@api/collections/content-runs/services/storyboard-shot-qa.service';
import { StoryboardShotRendersService } from '@api/collections/content-runs/services/storyboard-shot-renders.service';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { StoryboardVideoAssemblyService } from '@api/collections/content-runs/services/storyboard-video-assembly.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardShotRender } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import {
  editStoryboardAssetBible,
  editStoryboardVideoShots,
  type StartStoryboardVideoToolInput,
  type StoryboardVideoToolInput,
} from '@genfeedai/contracts/api-types/contracts/storyboard-video-tool.contract';
import { Traced } from '@libs/tracing/traced';
import { HttpException, Injectable } from '@nestjs/common';

type Quote = Extract<StoryboardVideoToolInput, { action: 'quote' }>;
type StageInput = Pick<
  Quote,
  | 'stage'
  | 'expectedRevision'
  | 'shotIds'
  | 'entryId'
  | 'assetAction'
  | 'count'
  | 'angles'
  | 'instruction'
>;

/** The asset bible request body, without the fields the stage ignores. */
function assetBody(input: StageInput) {
  return {
    expectedRevision: input.expectedRevision,
    entryId: input.entryId,
    action: input.assetAction,
    ...(input.count === undefined ? {} : { count: input.count }),
    ...(input.angles === undefined ? {} : { angles: input.angles }),
    ...(input.instruction === undefined
      ? {}
      : { instruction: input.instruction }),
  };
}

function renderSummary(render: StoryboardShotRender | undefined) {
  if (!render) return null;
  return {
    operationId: render.operationId,
    state: render.state,
    isCurrent: render.isCurrent,
    modelKey: render.modelKey,
    hasClip: Boolean(render.assetId),
    ...(render.qa
      ? {
          qa: {
            state: render.qa.state,
            failures: render.qa.failures.map((failure) => failure.message),
            continuity: render.qa.continuity ?? null,
          },
        }
      : {}),
  };
}

/**
 * What chat or MCP needs to take the next step on a realistic video: the
 * revision, each shot with its still, draft and final, the asset bible, and
 * what is still generating.
 */
export function summarizeVideoRun(run: StoryboardRun) {
  const { config } = run;
  const renders = config.shotRenders ?? [];
  const render = (shotId: string, stage: 'draft' | 'final') =>
    renderSummary(
      renders.find((item) => item.shotId === shotId && item.stage === stage),
    );
  const generating = (config.assetGenerations ?? []).filter(
    (item) => item.state === 'pending' || item.state === 'submitted',
  ).length;
  return {
    runId: run.id,
    brandId: run.brandId,
    revision: config.revision,
    state: config.state,
    isPlanApproved: config.approvedRevision === config.revision,
    title: config.plan.title,
    format: config.plan.format,
    shots: [...config.plan.shots]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((shot) => ({
        id: shot.id,
        ordinal: shot.ordinal,
        action: shot.action,
        dialogue: shot.dialogue ?? null,
        durationSeconds: shot.durationSeconds,
        cuts: shot.cuts ?? [],
        sfx: shot.sfx ?? [],
        referenceRoles: shot.referenceRoles ?? [],
        hasCustomPrompt: Boolean(shot.videoPrompt),
        stillState: shot.stillFreshness,
        draft: render(shot.id, 'draft'),
        final: render(shot.id, 'final'),
      })),
    assetBible: (config.plan.assetBible ?? []).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      castMemberId: entry.castMemberId ?? null,
      brief: entry.brief ?? null,
      sourceAssetIds: entry.sourceAssetIds,
      variantAssetIds: entry.variantAssetIds,
      chosenAssetId: entry.chosenAssetId ?? null,
    })),
    assetImagesGenerating: generating,
  };
}

/** A refusal is part of an estimate, not a failure of it. */
async function settle<T>(work: Promise<T>) {
  try {
    return { quote: await work };
  } catch (error: unknown) {
    if (error instanceof HttpException)
      return { quote: null, reason: error.message };
    throw error;
  }
}

/**
 * The realistic video tools (#9622) for chat and MCP, called in process.
 * Every step reuses the Studio's services, so a run started over MCP opens in
 * the Storyboard and the reverse. Only `start` spends credits, and only for a
 * quote whose inputHash still matches.
 */
@Traced()
@Injectable()
export class AgentStoryboardVideoTool {
  constructor(
    private readonly runs: StoryboardRunsService,
    private readonly stills: StoryboardStillsService,
    private readonly renders: StoryboardShotRendersService,
    private readonly assets: StoryboardAssetBibleService,
    private readonly qa: StoryboardShotQaService,
    private readonly assembly: StoryboardVideoAssemblyService,
  ) {}

  async work(
    input: StoryboardVideoToolInput,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const { organizationId, userId } = ctx;
    const { brandId } = input;
    switch (input.action) {
      case 'create':
        return summarizeVideoRun(
          await this.runs.create(organizationId, brandId, userId, {
            clientRequestId: input.clientRequestId,
            source: { kind: 'brief', brief: input.brief, length: 'short' },
            ...this.planSettings(input),
          }),
        );
      case 'get':
        return summarizeVideoRun(
          await this.runs.get(organizationId, brandId, input.runId),
        );
      case 'draft_plan':
        return summarizeVideoRun(
          await this.runs.draftPlan(
            organizationId,
            brandId,
            input.runId,
            userId,
            {
              expectedRevision: input.expectedRevision,
              ...(input.instruction === undefined
                ? {}
                : { instruction: input.instruction }),
            },
          ),
        );
      case 'edit_shots':
      case 'assets': {
        const current = await this.runs.get(
          organizationId,
          brandId,
          input.runId,
        );
        return summarizeVideoRun(
          await this.runs.updatePlan(organizationId, brandId, input.runId, {
            expectedRevision: input.expectedRevision,
            plan:
              input.action === 'edit_shots'
                ? editStoryboardVideoShots(current.config.plan, input.shots)
                : editStoryboardAssetBible(current.config.plan, input),
          }),
        );
      }
      case 'approve_plan':
        return summarizeVideoRun(
          await this.runs.approvePlan(organizationId, brandId, input.runId, {
            expectedRevision: input.expectedRevision,
          }),
        );
      case 'quote':
        return this.quote(organizationId, brandId, input.runId, input);
      case 'estimate':
        return this.estimate(
          organizationId,
          brandId,
          input.runId,
          input.expectedRevision,
        );
      case 'reconcile':
        return summarizeVideoRun(
          await this.reconcile(organizationId, brandId, input.runId),
        );
      case 'assemble':
        return this.assembly.assemble(
          { brandId, id: userId, organizationId, userId } as Parameters<
            StoryboardVideoAssemblyService['assemble']
          >[0],
          brandId,
          input.runId,
        );
    }
  }

  async start(
    input: StartStoryboardVideoToolInput,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const { organizationId, userId } = ctx;
    const { brandId, runId, inputHash, shotIds } = input;
    switch (input.stage) {
      case 'assets':
        return summarizeVideoRun(
          await this.assets.start(organizationId, brandId, runId, userId, {
            ...assetBody(input),
            inputHash,
          }),
        );
      case 'stills':
        return summarizeVideoRun(
          await this.stills.generate(organizationId, brandId, runId, userId, {
            expectedRevision: input.expectedRevision,
            inputHash,
            shotIds,
          }),
        );
      default:
        return summarizeVideoRun(
          await this.renders.start(organizationId, brandId, runId, userId, {
            expectedRevision: input.expectedRevision,
            stage: input.stage,
            shotIds,
            inputHash,
          }),
        );
    }
  }

  private quote(
    organizationId: string,
    brandId: string,
    runId: string,
    input: StageInput,
  ): Promise<Record<string, unknown>> {
    const shots = input.shotIds ? { shotIds: input.shotIds } : {};
    switch (input.stage) {
      case 'assets':
        return this.assets.quote(
          organizationId,
          brandId,
          runId,
          assetBody(input),
        );
      case 'stills':
        return this.stills.quote(organizationId, brandId, runId, {
          expectedRevision: input.expectedRevision,
          ...shots,
        });
      default:
        return this.renders.quote(organizationId, brandId, runId, {
          expectedRevision: input.expectedRevision,
          stage: input.stage,
          ...shots,
        });
    }
  }

  /**
   * Prices the shot work still left (stills, drafts, finals) without holding
   * credits. Asset bible images are quoted per entry, so they are not here.
   */
  private async estimate(
    organizationId: string,
    brandId: string,
    runId: string,
    expectedRevision: number,
  ): Promise<Record<string, unknown>> {
    const quote = (stage: 'stills' | 'draft' | 'final') =>
      settle(
        this.quote(organizationId, brandId, runId, {
          stage,
          expectedRevision,
        }),
      );
    const [stills, draft, final] = await Promise.all([
      quote('stills'),
      quote('draft'),
      quote('final'),
    ]);
    const total = [stills, draft, final].reduce(
      (sum, item) =>
        sum +
        (typeof item.quote?.total === 'number' ? Number(item.quote.total) : 0),
      0,
    );
    return { stills, draft, final, total };
  }

  /** Asset images, stills and renders that finished, then QA on new finals. */
  private async reconcile(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRun> {
    await this.assets.reconcile(organizationId, brandId, runId);
    await this.stills.reconcile(organizationId, brandId, runId);
    await this.renders.reconcile(organizationId, brandId, runId);
    return this.qa.check(organizationId, brandId, runId);
  }

  /** Format, length, style and cast become the plan every shot is drawn from. */
  private planSettings(
    input: Extract<StoryboardVideoToolInput, { action: 'create' }>,
  ) {
    if (
      !input.format &&
      !input.runtimeBudgetSeconds &&
      !input.styleReferenceAssetIds &&
      !input.cast
    )
      return {};
    return {
      planSettings: {
        kind: 'video' as const,
        videoModelKey: null,
        format: input.format ?? ('9:16' as const),
        runtimeBudgetSeconds: input.runtimeBudgetSeconds ?? null,
        styleReferenceAssetIds: input.styleReferenceAssetIds ?? [],
        cast: (input.cast ?? []).map((member, index) => ({
          id: `cast-${index + 1}`,
          name: member.name,
          referenceAssetIds: member.referenceAssetIds,
        })),
      },
    };
  }
}
