import { StoryboardARollService } from '@api/collections/content-runs/services/storyboard-a-roll.service';
import type { StoryboardStoredRunConfig } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import {
  quoteStoryboardARollSchema,
  type StoryboardLongFormEstimate,
  type StoryboardLongFormStageEstimate,
  storyboardLongFormEstimateSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';

type BillingMode = 'platform' | 'byok';

interface PricedStage {
  parts: number;
  credits: number;
  seconds?: number;
  billingMode?: BillingMode;
}

/**
 * The whole-video estimate for a long-form storyboard (#8221): what the
 * B-roll stills, the animatic and the presenter still cost, priced the way
 * each step's own quote prices it. It charges and holds nothing. Each step
 * is still quoted and bound to its quote before it runs, so none can charge
 * more than that quote.
 */
@Injectable()
export class StoryboardLongFormEstimateService {
  constructor(
    private readonly store: StoryboardRunStoreService,
    private readonly stills: StoryboardStillsService,
    private readonly aRoll: StoryboardARollService,
  ) {}

  async estimate(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardLongFormEstimate> {
    const parsed = quoteStoryboardARollSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'expectedRevision must be the run revision.',
      );
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      parsed.data.expectedRevision,
    );
    if (!config.plan.longForm)
      throw new ConflictException(
        'Only a long-form storyboard has a whole-video estimate.',
      );
    const [cutaways, animatic, presenter] = await Promise.all([
      stage(() => this.stills.estimateCutaways(organizationId, config)),
      stage(() =>
        this.presenterStage(
          'animatic',
          config,
          organizationId,
          brandId,
          userId,
        ),
      ),
      stage(() =>
        this.presenterStage('aRoll', config, organizationId, brandId, userId),
      ),
    ]);
    const modes = new Set(
      [cutaways, animatic, presenter].flatMap((item) =>
        item.billingMode ? [item.billingMode] : [],
      ),
    );
    return storyboardLongFormEstimateSchema.parse({
      revision: config.revision,
      billingMode:
        modes.size === 0 ? null : modes.size === 1 ? [...modes][0] : 'mixed',
      cutaways: publicStage(cutaways),
      animatic: publicStage(animatic),
      presenter: publicStage(presenter),
      totalCredits: cutaways.credits + animatic.credits + presenter.credits,
    });
  }

  private presenterStage(
    track: 'animatic' | 'aRoll',
    config: StoryboardStoredRunConfig,
    organizationId: string,
    brandId: string,
    userId: string,
  ) {
    return this.aRoll.estimate(track, organizationId, brandId, userId, config);
  }
}

/** A step the API refuses to price (no presenter yet, say) costs nothing now and says why. */
async function stage(
  price: () => Promise<PricedStage>,
): Promise<PricedStage & { problem?: string }> {
  try {
    return await price();
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    return { parts: 0, credits: 0, problem: error.message.slice(0, 500) };
  }
}

function publicStage({
  billingMode: _billingMode,
  ...rest
}: PricedStage & { problem?: string }): StoryboardLongFormStageEstimate {
  return rest;
}
