import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BatchProjectCreditsService } from '@api/collections/batch-projects/services/batch-project-credits.service';
import {
  IDEA_OUTPUT_ASPECT_RATIO,
  ideaPromptText,
  ideaSpeechText,
  parseBatchProjectItemDispatch,
  resolveIdeaGenerationParams,
} from '@api/collections/batch-projects/services/batch-project-dispatch.util';
import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import {
  BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS,
  BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
  BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
  buildBatchProjectIdeaDispatchFailureWorkflowDefinition,
  buildBatchProjectIdeaDispatchWorkflowDefinition,
} from '@api/collections/batch-projects/services/batch-project-idea-dispatch-workflow.definition';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchProjectItemStatus,
  IngredientCategory,
} from '@genfeedai/contracts';
import type {
  BatchIdea,
  IBatchProjectItemDispatch,
} from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

/** Job input of one idea generation attempt. */
export type BatchProjectIdeaDispatchJob = {
  itemId: string;
  key: string;
  organizationId: string;
  projectId: string;
  userId: string;
};

type IdeaGenerationRequest = RequestWithContext & DeferredCreditsRequest;

type DispatchTarget = {
  dispatch: IBatchProjectItemDispatch;
  idea: BatchIdea;
  item: BatchProjectItem;
  project: BatchProject;
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Generation could not start';
}

/**
 * Starts idea generation server-side (#5463) so an idea batch keeps
 * generating after the creator leaves. Each accepted quote line runs as one
 * durable system-workflow job keyed by its dispatch key:
 *
 * 1. the generation service creates the placeholder ingredient, which is
 *    recorded on the item before anything else happens;
 * 2. immediately before the provider call, the line's credits are reserved
 *    (image/video reserve inside the generation service with deferred
 *    credits; avatar reserves here) and checked against the accepted quote —
 *    a mismatch or a missing reservation aborts before the provider;
 * 3. the provider runs; reconciliation settles the hold when a usable output
 *    lands and releases it when generation fails.
 */
@Injectable()
export class BatchProjectIdeaDispatchService implements OnModuleInit {
  private readonly context = BatchProjectIdeaDispatchService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly credits: BatchProjectCreditsService,
    private readonly brandKitAssets: BrandKitAssetsService,
    private readonly imageGeneration: ImageGenerationService,
    private readonly videoGeneration: VideoGenerationService,
    private readonly avatarGeneration: AvatarVideoGenerationService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH,
      (request) => this.dispatchAction(request),
    );
    this.workflowRunner.registerAction(
      BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL,
      (request) => this.failAction(request),
    );
    this.workflowRunner.registerWorkflow(
      buildBatchProjectIdeaDispatchWorkflowDefinition(),
    );
    this.workflowRunner.registerWorkflow(
      buildBatchProjectIdeaDispatchFailureWorkflowDefinition(),
    );
  }

  /** Queue one attempt; the job id makes a repeated enqueue a no-op. */
  async enqueue(job: BatchProjectIdeaDispatchJob): Promise<void> {
    await this.workflowRunner.runWithRegisteredWorkflowModule(
      {
        canonicalId: BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
        organizationId: job.organizationId,
      },
      () => this.enqueueAdmitted(job),
    );
  }

  private async enqueueAdmitted(
    job: BatchProjectIdeaDispatchJob,
  ): Promise<void> {
    const attempt = job.key.split(':').pop() ?? '0';
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
        canonicalId: BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
        inputValues: { job },
        metadata: { batchProjectId: job.projectId, itemId: job.itemId },
        organizationId: job.organizationId,
        source: 'batch-project-idea-dispatch',
        userId: job.userId,
      },
      `batch-project-idea-${job.itemId}-${attempt}`,
      {
        attempts: 2,
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        failureWorkflow: {
          canonicalId: BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
          inputValues: { job },
        },
      },
    );
  }

  /** Generate one attempt; stale or already dispatched attempts are no-ops. */
  async dispatch(
    job: BatchProjectIdeaDispatchJob,
  ): Promise<{ status: 'dispatched' | 'failed' | 'skipped' }> {
    return this.workflowRunner.runWithRegisteredWorkflowModule(
      {
        canonicalId: BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
        organizationId: job.organizationId,
      },
      () => this.dispatchAdmitted(job),
    );
  }

  private async dispatchAdmitted(
    job: BatchProjectIdeaDispatchJob,
  ): Promise<{ status: 'dispatched' | 'failed' | 'skipped' }> {
    const target = await this.loadTarget(job);
    if (!target) {
      return { status: 'skipped' };
    }
    try {
      await this.generate(job, target);
      return { status: 'dispatched' };
    } catch (error: unknown) {
      await this.failItem(job, errorMessage(error));
      return { status: 'failed' };
    }
  }

  /**
   * Fail an attempt that could not start and release whatever it reserved.
   * Guarded by the dispatch key, so it never touches a newer attempt.
   */
  async failItem(job: BatchProjectIdeaDispatchJob, error: string) {
    const item = await this.prisma.batchProjectItem.findFirst({
      where: scopedWhere(job.organizationId, {
        id: job.itemId,
        projectId: job.projectId,
        status: BatchProjectItemStatus.GENERATING,
      }),
    });
    const dispatch = parseBatchProjectItemDispatch(item?.dispatch);
    if (!item || !dispatch || dispatch.key !== job.key) {
      return;
    }
    // Only a recorded hold is released: an attempt that never reached its
    // reservation has nothing to return.
    if (dispatch.state === 'reserved') {
      await this.credits.release({
        dispatch,
        organizationId: job.organizationId,
      });
    }
    await this.prisma.batchProjectItem.updateMany({
      data: {
        dispatch: toPrismaJson({ ...dispatch, state: 'released' }),
        error,
        status: BatchProjectItemStatus.FAILED,
      },
      where: scopedWhere(job.organizationId, {
        dispatch: { equals: job.key, path: ['key'] },
        id: item.id,
        status: BatchProjectItemStatus.GENERATING,
      }),
    });
    this.logger.warn('Batch project idea failed to start', {
      batchProjectId: job.projectId,
      batchProjectItemId: job.itemId,
      context: this.context,
      error,
      organizationId: job.organizationId,
    });
  }

  private dispatchAction(request: SystemWorkflowActionRequest) {
    return this.dispatch(this.readJob(request));
  }

  private async failAction(request: SystemWorkflowActionRequest) {
    await this.failItem(this.readJob(request), 'Generation could not start');
    return { status: 'failed' };
  }

  private readJob(request: SystemWorkflowActionRequest) {
    const job = readRecord(request.input.job);
    const parsed = {
      itemId: readString(job.itemId),
      key: readString(job.key),
      organizationId: readString(job.organizationId),
      projectId: readString(job.projectId),
      userId: readString(job.userId),
    };
    if (
      !parsed.itemId ||
      !parsed.key ||
      !parsed.organizationId ||
      !parsed.projectId ||
      !parsed.userId ||
      parsed.organizationId !== request.context.organizationId
    ) {
      throw new ConflictException('Invalid batch project idea dispatch job.');
    }
    return parsed as BatchProjectIdeaDispatchJob;
  }

  private async loadTarget(
    job: BatchProjectIdeaDispatchJob,
  ): Promise<DispatchTarget | null> {
    const [project, item] = await Promise.all([
      this.prisma.batchProject.findFirst({
        where: scopedWhere(job.organizationId, { id: job.projectId }),
      }),
      this.prisma.batchProjectItem.findFirst({
        where: scopedWhere(job.organizationId, {
          id: job.itemId,
          projectId: job.projectId,
        }),
      }),
    ]);
    const dispatch = parseBatchProjectItemDispatch(item?.dispatch);
    const idea = readBatchProjectIdea(item?.idea);
    if (
      !project ||
      !item ||
      !dispatch ||
      !idea ||
      item.status !== BatchProjectItemStatus.GENERATING ||
      dispatch.key !== job.key ||
      dispatch.state !== 'queued' ||
      item.outputIngredientId
    ) {
      return null;
    }
    return { dispatch, idea, item, project };
  }

  private async generate(
    job: BatchProjectIdeaDispatchJob,
    target: DispatchTarget,
  ): Promise<void> {
    const { dispatch, idea, item, project } = target;
    const user: AuthenticatedUser = {
      brandId: project.brandId,
      id: job.userId,
      organizationId: job.organizationId,
      userId: job.userId,
    };
    const placeholderScope: GenerationPlaceholderScope = {
      groupId: project.id,
      groupIndex: item.position,
      isByokBypass: dispatch.billingMode === 'byok',
      settleCreditsExternally: true,
    };
    const onPlaceholderCreated = async (ingredientId: string) => {
      await this.recordPlaceholder(job, idea, ingredientId);
    };

    if (idea.format === 'avatar') {
      // The avatar service resolves the brand's (else the organization's)
      // default avatar and saved voice into provider identities.
      await this.avatarGeneration.generateAvatarVideo(
        {
          aspectRatio: IDEA_OUTPUT_ASPECT_RATIO,
          text: ideaSpeechText(idea),
          useIdentity: true,
        },
        {
          brandId: project.brandId,
          organizationId: job.organizationId,
          userId: job.userId,
        },
        onPlaceholderCreated,
        placeholderScope,
        async (price) => {
          if (
            price.billingMode !== dispatch.billingMode ||
            price.credits !== dispatch.credits
          ) {
            throw new ConflictException(
              'Avatar funding changed after the accepted quote. Retry with a fresh quote.',
            );
          }
          await this.reserveLine(job, dispatch, project.brandId);
        },
      );
      return;
    }

    const request = {
      body: { sourceActionId: dispatch.key },
      creditsConfig: { deferred: true },
      user,
    } as IdeaGenerationRequest;
    const references = (
      await this.brandKitAssets.resolveBrandKitAssets(
        project.brandId,
        job.organizationId,
      )
    ).references.map((reference) => reference.id);
    const { duration, height, width } = resolveIdeaGenerationParams(
      idea.format,
    );
    const media = {
      autoSelectModel: false,
      brandId: project.brandId,
      brandingMode: 'brand',
      ...(duration ? { duration } : {}),
      height,
      isBrandingEnabled: true,
      model: dispatch.model,
      outputs: 1,
      references,
      sourceActionId: dispatch.key,
      text: ideaPromptText(idea),
      width,
    };
    const onCreditsPrepared = () =>
      this.recordGenerationReservation(job, dispatch, request);

    if (idea.format === 'video') {
      await this.videoGeneration.generateVideo(
        user,
        media as CreateVideoDto,
        request,
        onPlaceholderCreated,
        placeholderScope,
        onCreditsPrepared,
      );
      return;
    }
    await this.imageGeneration.generateImage(
      user,
      { ...media, waitForCompletion: false } as CreateImageDto,
      request,
      onPlaceholderCreated,
      placeholderScope,
      onCreditsPrepared,
    );
  }

  private async recordPlaceholder(
    job: BatchProjectIdeaDispatchJob,
    idea: BatchIdea,
    ingredientId: string,
  ): Promise<void> {
    await this.prisma.batchProjectItem.updateMany({
      data: {
        outputCategory:
          idea.format === 'image'
            ? IngredientCategory.IMAGE
            : idea.format === 'avatar'
              ? IngredientCategory.AVATAR
              : IngredientCategory.VIDEO,
        outputIngredientId: ingredientId,
      },
      where: scopedWhere(job.organizationId, {
        dispatch: { equals: job.key, path: ['key'] },
        id: job.itemId,
        outputIngredientId: null,
        status: BatchProjectItemStatus.GENERATING,
      }),
    });
  }

  /** Avatar lines reserve here, right before the provider call. */
  private async reserveLine(
    job: BatchProjectIdeaDispatchJob,
    dispatch: IBatchProjectItemDispatch,
    brandId: string | null | undefined,
  ): Promise<void> {
    const reservationId = await this.credits.reserve({
      actorUserId: job.userId,
      brandId,
      dispatch,
      organizationId: job.organizationId,
    });
    await this.markReserved(job, dispatch, reservationId);
  }

  /**
   * Image and video services reserve the request's price themselves before
   * their provider call; accept it only when it is exactly the accepted line.
   */
  private async recordGenerationReservation(
    job: BatchProjectIdeaDispatchJob,
    dispatch: IBatchProjectItemDispatch,
    request: IdeaGenerationRequest,
  ): Promise<void> {
    const credits = request.creditsConfig;
    const isByok = Boolean(credits?.isByokBypass);
    const amount = isByok ? 0 : (credits?.amount ?? 0);
    if (
      !credits ||
      credits.modelKey !== dispatch.model ||
      isByok !== (dispatch.billingMode === 'byok') ||
      amount !== dispatch.credits ||
      (dispatch.credits > 0 && !credits.reservationId)
    ) {
      if (credits?.reservationId) {
        await this.credits.release({
          dispatch: { ...dispatch, reservationId: credits.reservationId },
          organizationId: job.organizationId,
        });
      }
      throw new ConflictException(
        'Generation pricing changed after the accepted quote. Retry with a fresh quote.',
      );
    }
    await this.markReserved(job, dispatch, credits.reservationId);
  }

  private async markReserved(
    job: BatchProjectIdeaDispatchJob,
    dispatch: IBatchProjectItemDispatch,
    reservationId: string | undefined,
  ): Promise<void> {
    await this.prisma.batchProjectItem.updateMany({
      data: {
        dispatch: toPrismaJson({
          ...dispatch,
          state: 'reserved',
          ...(reservationId ? { reservationId } : {}),
        }),
      },
      where: scopedWhere(job.organizationId, {
        dispatch: { equals: job.key, path: ['key'] },
        id: job.itemId,
        status: BatchProjectItemStatus.GENERATING,
      }),
    });
  }
}
