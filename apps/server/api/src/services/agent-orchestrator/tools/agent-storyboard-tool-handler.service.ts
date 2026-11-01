import { StoryboardARollService } from '@api/collections/content-runs/services/storyboard-a-roll.service';
import { StoryboardLongFormAssemblyService } from '@api/collections/content-runs/services/storyboard-long-form-assembly.service';
import { StoryboardLongFormEstimateService } from '@api/collections/content-runs/services/storyboard-long-form-estimate.service';
import { StoryboardLongFormTranslationService } from '@api/collections/content-runs/services/storyboard-long-form-translation.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { StoryboardSlideshowPostService } from '@api/collections/content-runs/services/storyboard-slideshow-post.service';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { StoryboardPresenterTrack } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import {
  editStoryboardLongFormScript,
  type StoryboardLongFormStage,
  type StoryboardLongFormToolInput,
  startStoryboardLongFormToolSchema,
  storyboardLongFormToolSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-long-form-tool.contract';
import type {
  StoryboardRun,
  StoryboardRunConfig,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  editStoryboardSlideshow,
  type StoryboardSlideshowToolInput,
  startStoryboardSlideshowToolSchema,
  storyboardSlideshowToolSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-slideshow-tool.contract';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { HttpException, Injectable } from '@nestjs/common';
import type { z } from 'zod';

export function isAgentStoryboardTool(toolName: string): boolean {
  switch (toolName) {
    case 'storyboard_long_form':
    case 'start_storyboard_long_form':
    case 'storyboard_slideshow':
    case 'start_storyboard_slideshow':
      return true;
    default:
      return false;
  }
}

const PRESENTER_TRACKS: Record<
  Exclude<StoryboardLongFormStage, 'cutaways'>,
  StoryboardPresenterTrack
> = { animatic: 'animatic', presenter: 'aRoll' };

/**
 * The long-form storyboard tools in chat (#8225), the same steps the MCP
 * server reaches over HTTP, called in process. Reads, edits, quotes and
 * assembly never spend credits; `start_storyboard_long_form` starts a quoted
 * render, is credit-spending, and so waits for chat approval in Manual mode.
 * The API still refuses it when the quoted inputs changed.
 */
@Injectable()
export class AgentStoryboardToolHandler {
  constructor(
    private readonly runs: StoryboardRunsService,
    private readonly stills: StoryboardStillsService,
    private readonly aRoll: StoryboardARollService,
    private readonly estimates: StoryboardLongFormEstimateService,
    private readonly translations: StoryboardLongFormTranslationService,
    private readonly assembly: StoryboardLongFormAssemblyService,
    private readonly moduleAccess: OrganizationModuleAccessService,
    private readonly slideshowPosts: StoryboardSlideshowPostService,
  ) {}

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      const data = await this.run(toolName, params, ctx);
      return { creditsUsed: 0, data, success: true };
    } catch (error: unknown) {
      return { creditsUsed: 0, error: readToolError(error), success: false };
    }
  }

  private run(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    switch (toolName) {
      case 'start_storyboard_long_form':
        return this.render(params, ctx);
      case 'storyboard_slideshow':
        return this.slideshow(params, ctx);
      case 'start_storyboard_slideshow':
        return this.renderSlides(params, ctx);
      default:
        return this.work(params, ctx);
    }
  }

  private async slideshow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const input = parseOrThrow(storyboardSlideshowToolSchema, params);
    const { organizationId, userId } = ctx;
    const { brandId } = input;
    if (input.action !== 'get')
      await this.moduleAccess.assertAccess(organizationId, 'storyboard');
    switch (input.action) {
      case 'create':
        return summarizeRun(
          await this.runs.create(organizationId, brandId, userId, {
            clientRequestId: input.clientRequestId,
            source: { kind: 'brief', brief: input.brief, length: 'slideshow' },
            ...slideshowSettings(input),
          }),
        );
      case 'get':
        return summarizeRun(
          await this.runs.get(organizationId, brandId, input.runId),
        );
      case 'draft_plan':
        return summarizeRun(
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
      case 'edit_slides': {
        const current = await this.runs.get(
          organizationId,
          brandId,
          input.runId,
        );
        return summarizeRun(
          await this.runs.updatePlan(organizationId, brandId, input.runId, {
            expectedRevision: input.expectedRevision,
            plan: editStoryboardSlideshow(current.config.plan, input),
          }),
        );
      }
      case 'approve_plan':
        return summarizeRun(
          await this.runs.approvePlan(organizationId, brandId, input.runId, {
            expectedRevision: input.expectedRevision,
          }),
        );
      case 'quote':
        return this.stills.quote(organizationId, brandId, input.runId, {
          expectedRevision: input.expectedRevision,
          ...(input.slideIds ? { shotIds: input.slideIds } : {}),
        });
      case 'reconcile':
        return summarizeRun(
          await this.stills.reconcile(organizationId, brandId, input.runId),
        );
      case 'save_draft_post':
        return {
          ...(await this.slideshowPosts.createDraft(
            organizationId,
            brandId,
            input.runId,
            userId,
            { expectedRevision: input.expectedRevision },
          )),
          // The post is a draft: scheduling or publishing is the user's call.
          executionState: 'draft',
        };
    }
  }

  private async renderSlides(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const { brandId, expectedRevision, inputHash, runId, slideIds } =
      parseOrThrow(startStoryboardSlideshowToolSchema, params);
    const { organizationId, userId } = ctx;
    await this.moduleAccess.assertAccess(organizationId, 'storyboard');
    return summarizeRun(
      await this.stills.generate(organizationId, brandId, runId, userId, {
        expectedRevision,
        inputHash,
        shotIds: slideIds,
      }),
    );
  }

  private async work(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const input = parseOrThrow(storyboardLongFormToolSchema, params);
    const { organizationId, userId } = ctx;
    const { brandId } = input;
    if (input.action !== 'get')
      await this.moduleAccess.assertAccess(organizationId, 'storyboard');
    switch (input.action) {
      case 'create':
        return summarizeRun(
          await this.runs.create(organizationId, brandId, userId, {
            clientRequestId: input.clientRequestId,
            source: { kind: 'brief', brief: input.brief, length: 'long_form' },
          }),
        );
      case 'get':
        return summarizeRun(
          await this.runs.get(organizationId, brandId, input.runId),
        );
      case 'draft_plan':
        return summarizeRun(
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
      case 'edit_script':
        return this.editScript(organizationId, brandId, input);
      case 'approve_plan':
        return summarizeRun(
          await this.runs.approvePlan(organizationId, brandId, input.runId, {
            expectedRevision: input.expectedRevision,
          }),
        );
      case 'quote':
        return input.stage === 'cutaways'
          ? this.stills.quote(organizationId, brandId, input.runId, {
              expectedRevision: input.expectedRevision,
              ...(input.cutawayIds ? { cutawayIds: input.cutawayIds } : {}),
            })
          : this.aRoll.quote(
              PRESENTER_TRACKS[input.stage],
              organizationId,
              brandId,
              input.runId,
              userId,
              { expectedRevision: input.expectedRevision },
            );
      case 'estimate':
        return this.estimates.estimate(
          organizationId,
          brandId,
          input.runId,
          userId,
          { expectedRevision: input.expectedRevision },
        );
      case 'translate':
        return summarizeRun(
          await this.translations.translate(
            organizationId,
            brandId,
            input.runId,
            userId,
            {
              clientRequestId: input.clientRequestId,
              expectedRevision: input.expectedRevision,
              language: input.language,
            },
          ),
        );
      case 'reconcile':
        // Presenter and animatic renders, then the cutaway stills.
        await this.aRoll.reconcile(organizationId, brandId, input.runId);
        return summarizeRun(
          await this.stills.reconcile(organizationId, brandId, input.runId),
        );
      case 'assemble': {
        const { editorProjectId, skippedCutawayIds } =
          await this.assembly.assemble(
            {
              brandId,
              id: userId,
              organizationId,
              userId,
            },
            brandId,
            input.runId,
            input.track === 'final' ? 'aRoll' : 'animatic',
          );
        return { editorProjectId, skippedCutawayIds };
      }
    }
  }

  private async editScript(
    organizationId: string,
    brandId: string,
    input: Extract<StoryboardLongFormToolInput, { action: 'edit_script' }>,
  ): Promise<Record<string, unknown>> {
    const current = await this.runs.get(organizationId, brandId, input.runId);
    return summarizeRun(
      await this.runs.updatePlan(organizationId, brandId, input.runId, {
        expectedRevision: input.expectedRevision,
        plan: editStoryboardLongFormScript(current.config.plan, input),
      }),
    );
  }

  private async render(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const { brandId, cutawayIds, expectedRevision, inputHash, runId, stage } =
      parseOrThrow(startStoryboardLongFormToolSchema, params);
    const { organizationId, userId } = ctx;
    await this.moduleAccess.assertAccess(organizationId, 'storyboard');
    return summarizeRun(
      stage === 'cutaways'
        ? await this.stills.generate(organizationId, brandId, runId, userId, {
            cutawayIds,
            expectedRevision,
            inputHash,
          })
        : await this.aRoll.render(
            PRESENTER_TRACKS[stage],
            organizationId,
            brandId,
            runId,
            userId,
            { expectedRevision, inputHash },
          ),
    );
  }
}

/**
 * What chat needs to take the next step: the revision to send back, and the
 * script with the segment and cutaway ids that edits, quotes and renders name.
 */
export function summarizeRun(run: StoryboardRun) {
  const { config } = run;
  const longForm = config.plan.longForm;
  return {
    runId: run.id,
    brandId: run.brandId,
    revision: config.revision,
    state: config.state,
    isPlanApproved: config.approvedRevision === config.revision,
    title: config.plan.title,
    animatic: summarizeTrack(config.animatic),
    presenter: summarizeTrack(config.aRoll),
    slideshow:
      config.plan.kind === 'slideshow'
        ? {
            caption: config.plan.logline,
            format: config.plan.format,
            slides: config.plan.shots.map((shot) => ({
              id: shot.id,
              description: shot.action,
              sectionLabel: shot.sectionLabel ?? null,
              imageState: shot.stillFreshness,
            })),
          }
        : null,
    longForm: longForm
      ? {
          presenterId: longForm.presenterId ?? null,
          runtimeBudgetSeconds: longForm.runtimeBudgetSeconds,
          segments: longForm.segments.map((segment) => ({
            id: segment.id,
            sectionLabel: segment.sectionLabel ?? null,
            narration: segment.narration,
            estimatedSeconds: segment.estimatedSeconds,
            cutaways: segment.cutaways.map((cutaway) => ({
              id: cutaway.id,
              brief: cutaway.brief,
              hasFootage: Boolean(cutaway.assetId),
            })),
          })),
        }
      : null,
  };
}

/** How many presenter or animatic chunks are in each render state. */
function summarizeTrack(track: StoryboardRunConfig['aRoll']) {
  if (!track) return null;
  const chunks: Record<string, number> = {};
  for (const chunk of track.chunks)
    chunks[chunk.state] = (chunks[chunk.state] ?? 0) + 1;
  return { chunks, total: track.chunks.length };
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(
    `Invalid storyboard input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
  );
}

function readToolError(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.length > 0) return body;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (typeof record.detail === 'string' && record.detail.length > 0)
        return record.detail;
      if (typeof record.message === 'string' && record.message.length > 0)
        return record.message;
    }
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return 'The storyboard step failed.';
}

/** Style references and cast become the plan settings every slide is drawn from. */
function slideshowSettings(
  input: Extract<StoryboardSlideshowToolInput, { action: 'create' }>,
) {
  if (!input.styleReferenceAssetIds && !input.cast) return {};
  return {
    planSettings: {
      kind: 'slideshow' as const,
      videoModelKey: null,
      format: '4:5' as const,
      runtimeBudgetSeconds: null,
      styleReferenceAssetIds: input.styleReferenceAssetIds ?? [],
      cast: (input.cast ?? []).map((member, index) => ({
        id: `cast-${index + 1}`,
        name: member.name,
        referenceAssetIds: member.referenceAssetIds,
      })),
    },
  };
}
