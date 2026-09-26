import { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { MediaPerceptionQueueService } from '@api/services/media-perception/media-perception-queue.service';
import { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import { MediaModerationQueueService } from '@api/services/moderation/media-moderation-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { MEDIA_PERCEPTION_SWEEP_BATCH_SIZE } from '@workers/crons/media-perception/media-perception.constants';

const MS_PER_HOUR = 60 * 60 * 1000;

export type MediaPerceptionSweepTotals = {
  queuedModerations: number;
  queuedPerceptions: number;
  queuedRetries: number;
};

/**
 * Feeds the media perception queue (#4879).
 *
 * An ingredient reaches a completed state from dozens of generation, upload
 * and import paths. Rather than hooking each one, this sweep finds recently
 * completed media assets without a perception record — generation completion
 * and uploads alike — and queues them, plus records whose provider artefacts
 * are due for a retry. Job ids deduplicate, so overlapping sweeps are safe.
 */
@Injectable()
export class CronMediaPerceptionService {
  private readonly context = 'CronMediaPerceptionService';

  constructor(
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly queueService: MediaPerceptionQueueService,
    private readonly mediaModerationService: MediaModerationService,
    private readonly moderationQueueService: MediaModerationQueueService,
    private readonly mediaVisionEvaluationService: MediaVisionEvaluationService,
    private readonly mediaTextDecisionService: MediaTextDecisionService,
    private readonly logger: LoggerService,
  ) {}

  async queueDuePerceptions(
    now = new Date(),
  ): Promise<MediaPerceptionSweepTotals> {
    const totals: MediaPerceptionSweepTotals = {
      queuedModerations: 0,
      queuedPerceptions: 0,
      queuedRetries: 0,
    };
    const settings = this.mediaPerceptionService.settings;
    if (!settings.isEnabled) {
      return totals;
    }

    const since = new Date(
      now.getTime() - settings.lookbackHours * MS_PER_HOUR,
    );
    const [unperceived, retries] = await Promise.all([
      this.mediaPerceptionService.findUnperceivedAssets(
        since,
        MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
      ),
      this.mediaPerceptionService.findDueRetries(
        now,
        MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
      ),
    ]);

    for (const candidate of unperceived) {
      if (
        await this.tryEnqueue(() =>
          this.queueService.enqueue(candidate, 'perceive'),
        )
      ) {
        totals.queuedPerceptions += 1;
      }
    }
    for (const candidate of retries) {
      if (
        await this.tryEnqueue(() =>
          this.queueService.enqueue(candidate, 'retry'),
        )
      ) {
        totals.queuedRetries += 1;
      }
    }

    // Moderation (#4880) follows perception: assets whose artefacts settled
    // without a moderation record. Empty when no provider is active.
    // Vision flags (#4881) run in the same gates job; the shared job id
    // dedupes an asset that needs both.
    const [unmoderated, unevaluated, undecided] = await Promise.all([
      this.mediaModerationService.findUnmoderatedAssets(
        since,
        MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
      ),
      this.mediaVisionEvaluationService.findUnevaluatedAssets(
        since,
        MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
      ),
      this.mediaTextDecisionService.findUndecidedAssets(
        since,
        MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
        now,
      ),
    ]);
    for (const candidate of [...unmoderated, ...unevaluated, ...undecided]) {
      if (
        await this.tryEnqueue(() =>
          this.moderationQueueService.enqueue(candidate),
        )
      ) {
        totals.queuedModerations += 1;
      }
    }

    if (
      totals.queuedPerceptions > 0 ||
      totals.queuedRetries > 0 ||
      totals.queuedModerations > 0
    ) {
      this.logger.log('CronMediaPerceptionService queued work', {
        ...totals,
        context: this.context,
      });
    }
    return totals;
  }

  private async tryEnqueue(enqueue: () => Promise<void>): Promise<boolean> {
    try {
      await enqueue();
      return true;
    } catch (error: unknown) {
      this.logger.error('CronMediaPerceptionService failed to queue asset', {
        context: this.context,
        error: getErrorMessage(error),
      });
      return false;
    }
  }
}
