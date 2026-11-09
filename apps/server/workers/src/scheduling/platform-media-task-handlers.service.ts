import { Injectable } from '@nestjs/common';
import { CronExternalVoiceCatalogService } from '@workers/crons/external-voice-catalog/cron.external-voice-catalog.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { CronTurboRunReconcileService } from '@workers/crons/turbo-run/cron.turbo-run-reconcile.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { PlatformMediaSchedulesService } from '@workers/scheduling/platform-media-schedules.service';
import {
  PLATFORM_SCHEDULED_TASKS,
  type PlatformTaskHandler,
} from '@workers/scheduling/platform-schedules.constants';

/** Model, media, ingredient and turbo-run maintenance tasks. */
@Injectable()
export class PlatformMediaTaskHandlers {
  constructor(
    private readonly turboRun: CronTurboRunReconcileService,
    private readonly falModelWatcher: CronFalModelWatcherService,
    private readonly ingredients: CronIngredientsService,
    private readonly mediaPerception: CronMediaPerceptionService,
    private readonly modelDeprecation: CronModelDeprecationService,
    private readonly modelWatcher: CronModelWatcherService,
    private readonly transcriptPurge: CronTranscriptPurgeService,
    private readonly workflowArtifacts: CronWorkflowArtifactsService,
    private readonly externalVoiceCatalog: CronExternalVoiceCatalogService,
    private readonly mediaSchedules: PlatformMediaSchedulesService,
  ) {}

  createHandlers() {
    return {
      [PLATFORM_SCHEDULED_TASKS.CRUN_TASK_RECONCILE]: () =>
        this.mediaSchedules.reconcileCrunTasks(),
      [PLATFORM_SCHEDULED_TASKS.CRUN_CONTRACT_SYNC]: () =>
        this.mediaSchedules.synchronizeCrunContracts(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_CREDIT_SETTLEMENT_RECONCILE]: () =>
        this.turboRun.reconcileSettlementShortfalls(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_RECONCILE]: () =>
        this.turboRun.resumeStrandedTurboRuns(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_PROJECT_RECONCILE]: () =>
        this.turboRun.reconcileTurboProjects(),
      [PLATFORM_SCHEDULED_TASKS.EDITOR_RENDER_RECONCILE]: () =>
        this.mediaSchedules.reconcileEditorRenders(),
      [PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY]: () =>
        this.falModelWatcher.refreshRegistryModels(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_METADATA_REFRESH]: () =>
        this.ingredients.refreshMissingMetadataDimensions(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_PROCESSING_RECONCILE]: () =>
        this.ingredients.checkStuckProcessingIngredients(),
      [PLATFORM_SCHEDULED_TASKS.MEDIA_PERCEPTION_SWEEP]: () =>
        this.mediaPerception.queueDuePerceptions(),
      [PLATFORM_SCHEDULED_TASKS.MODEL_DEPRECATION]: () =>
        this.modelDeprecation.deprecateSupersededModels(),
      [PLATFORM_SCHEDULED_TASKS.RAW_CUT_CLIP_RECONCILE]: () =>
        this.mediaSchedules.reconcileRawCutClips(),
      [PLATFORM_SCHEDULED_TASKS.REPLICATE_MODEL_DISCOVERY]: () =>
        this.modelWatcher.discoverNewModels(),
      [PLATFORM_SCHEDULED_TASKS.TRANSCRIPT_PURGE]: () =>
        this.transcriptPurge.purgeExpiredTranscripts(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_ARTIFACT_CLEANUP]: () =>
        this.workflowArtifacts.queueExpiredArtifactCleanup(),
      [PLATFORM_SCHEDULED_TASKS.AVATAR_TWIN_TRACKING]: () =>
        this.mediaSchedules.trackAvatarTwins(),
      [PLATFORM_SCHEDULED_TASKS.EXTERNAL_VOICE_CATALOG_SYNC]: () =>
        this.externalVoiceCatalog.syncFromProviders(),
    } satisfies Partial<
      Record<
        (typeof PLATFORM_SCHEDULED_TASKS)[keyof typeof PLATFORM_SCHEDULED_TASKS],
        PlatformTaskHandler
      >
    >;
  }
}
