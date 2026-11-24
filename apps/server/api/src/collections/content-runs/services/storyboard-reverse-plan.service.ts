import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { storyboardCapabilityError } from '@api/collections/content-runs/services/storyboard-plan-capabilities';
import { StoryboardDraftOutputError } from '@api/collections/content-runs/services/storyboard-plan-draft';
import {
  assertStoryboardEditable,
  editStoryboardPlan,
} from '@api/collections/content-runs/services/storyboard-plan-state';
import { StoryboardReferenceAnalysisService } from '@api/collections/content-runs/services/storyboard-reference-analysis.service';
import {
  assembleReversedImagePlan,
  assembleReversedVideoPlan,
} from '@api/collections/content-runs/services/storyboard-reference-plan';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import {
  isStoryboardSlideshow,
  type StoryboardPlan,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { reverseStoryboardPlanSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-reference-analysis.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const RETRYABLE_MESSAGE =
  'The reference could not be turned into shots. Nothing was changed; try again.';

export interface ReversedStoryboard {
  /** What was read from the reference, for callers that show or pass it on. */
  analysis: {
    kind: 'image' | 'video';
    overlays: readonly string[];
    style: StoryboardPlan['styleLabel'];
  };
  run: StoryboardRun;
}

/**
 * Reverse engineers a Library video or image into the shots of a storyboard
 * that starts from a written brief (#10578). The analysis happens before
 * anything is written, so a failed one leaves the run untouched; the result
 * goes through the same plan edit, asset check and revision rules as a draft.
 */
@Traced()
@Injectable()
export class StoryboardReversePlanService {
  constructor(
    private readonly store: StoryboardRunStoreService,
    private readonly capabilities: StoryboardRunCapabilitiesService,
    private readonly source: StoryboardSourceService,
    private readonly analysis: StoryboardReferenceAnalysisService,
  ) {}

  async reverse(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<ReversedStoryboard> {
    const parsed = reverseStoryboardPlanSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      );
    const input = parsed.data;
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    assertStoryboardEditable(config);
    if (config.sourceSnapshot.selector.kind !== 'brief')
      throw new BadRequestException(
        'Reversing a reference needs a storyboard that starts from a written brief. This one starts from a video, which is analysed instead.',
      );
    if (config.plan.longForm || isStoryboardSlideshow(config.plan))
      throw new BadRequestException(
        'Reversing a reference builds shot-by-shot videos, not long-form or slideshow storyboards.',
      );
    const capabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    if (capabilities.status !== 'available' || !capabilities.effectiveModel)
      storyboardCapabilityError(
        capabilities.reasonCode ?? 'MODEL_CAPABILITIES_UNAVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const model = capabilities.effectiveModel;
    const hasShots = config.plan.shots.some((shot) => shot.action.length > 0);
    const reference = await this.analysis.analyse({
      assetId: input.assetId,
      brandId,
      organizationId,
      planBudgetSeconds: config.plan.runtimeBudgetSeconds,
      supportedDurationsSeconds: model.supportedDurationsSeconds,
    });
    let plan: StoryboardPlan;
    try {
      plan =
        reference.kind === 'video'
          ? assembleReversedVideoPlan(
              {
                current: config.plan,
                model,
                runtimeBudgetSeconds: reference.runtimeBudgetSeconds,
              },
              reference.analysis,
            )
          : assembleReversedImagePlan(
              { current: config.plan, model },
              input.assetId,
              reference.analysis,
            );
    } catch (error: unknown) {
      // An answer that cannot be a plan is retryable, as for a drafted plan.
      if (error instanceof StoryboardDraftOutputError)
        throw new ServiceUnavailableException(RETRYABLE_MESSAGE);
      throw error;
    }
    const next = editStoryboardPlan(config, plan);
    await this.source.validatePlanAssets(organizationId, brandId, next.plan);
    const run = await this.store.save(
      organizationId,
      brandId,
      runId,
      config,
      // Reset restores the last generated plan; a replaced plan keeps the earlier one.
      reference.kind === 'video' && !hasShots
        ? storyboardStoredRunConfigSchema.parse({
            ...next,
            generatedPlan: next.plan,
          })
        : next,
    );
    return {
      analysis: {
        kind: reference.kind,
        overlays: (reference.kind === 'video'
          ? reference.analysis.shots.flatMap((shot) => shot.overlays)
          : reference.analysis.overlays
        ).map((overlay) => overlay.text),
        style: reference.analysis.style.label,
      },
      run,
    };
  }
}
