import { StoryboardPlanDraftService } from '@api/collections/content-runs/services/storyboard-plan-draft.service';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import {
  type StoryboardRun,
  translateStoryboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { STORYBOARD_LONG_BRIEF_MAX_CHARACTERS } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/**
 * The same long-form video in another language (#8226): a new storyboard
 * with the script translated line by line. The presenter, cutaways and their
 * stills carry over, so only the narration is rendered again, and each of
 * those renders is quoted and approved on the new storyboard first. A dub of
 * the finished audio would leave the avatar's lips out of sync.
 */
@Injectable()
export class StoryboardLongFormTranslationService {
  constructor(
    private readonly store: StoryboardRunStoreService,
    private readonly runs: StoryboardRunsService,
    private readonly drafter: StoryboardPlanDraftService,
  ) {}

  async translate(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const parsed = translateStoryboardRunSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Choose a supported language and send the run revision with a new request ID.',
      );
    const { clientRequestId, expectedRevision, language } = parsed.data;
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      expectedRevision,
    );
    const selector = config.sourceSnapshot.selector;
    const longForm = config.plan.longForm;
    if (selector.kind !== 'brief' || !longForm?.segments.length)
      throw new ConflictException(
        'Only a long-form storyboard with a script can be made in another language.',
      );
    const settings = config.plan;
    const copy = await this.runs.create(organizationId, brandId, userId, {
      clientRequestId,
      source: {
        kind: 'brief',
        brief:
          selector.brief ||
          longForm.segments
            .map((segment) => segment.narration)
            .join('\n\n')
            .slice(0, STORYBOARD_LONG_BRIEF_MAX_CHARACTERS),
        length: 'long_form',
      },
      planSettings: {
        videoModelKey: settings.videoModelKey,
        format: settings.format,
        runtimeBudgetSeconds: null,
        ...(settings.styleLabel ? { styleLabel: settings.styleLabel } : {}),
        styleReferenceAssetIds: settings.styleReferenceAssetIds,
        cast: settings.cast,
      },
    });
    // A retried request returns the copy it already translated.
    if (copy.config.plan.longForm?.segments.length) return copy;
    const plan = await this.drafter.translateLongForm({
      plan: config.plan,
      language,
    });
    return this.runs.updatePlan(organizationId, brandId, copy.id, {
      expectedRevision: copy.config.revision,
      plan,
    });
  }
}
