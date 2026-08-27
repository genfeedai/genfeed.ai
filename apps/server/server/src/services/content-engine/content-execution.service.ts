import { type ContentPlanItemDocument } from '@server/collections/content-plan-items/schemas/content-plan-item.schema';
import { ContentPlanItemsService } from '@server/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@server/collections/content-plans/services/content-plans.service';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';
import { ContentOrchestrationService } from '@server/services/content-orchestration/content-orchestration.service';
import { PipelineStep } from '@server/services/content-orchestration/pipeline.interfaces';
import { SkillExecutorService } from '@server/services/skill-executor/skill-executor.service';
import {
  ContentPlanItemStatus,
  ContentPlanItemType,
  ContentPlanStatus,
  type ImageTaskModel,
  type MusicTaskModel,
  type VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ExecutionResult {
  itemId: string;
  status: ContentPlanItemStatus;
  postId?: string;
  error?: string;
}

@Injectable()
export class ContentExecutionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentPlansService: ContentPlansService,
    private readonly contentPlanItemsService: ContentPlanItemsService,
    private readonly reviewablePostsService: ReviewablePostsService,
    private readonly skillExecutorService: SkillExecutorService,
    private readonly contentOrchestrationService: ContentOrchestrationService,
    private readonly logger: LoggerService,
  ) {}

  async executePlan(
    organizationId: string,
    brandId: string,
    planId: string,
    userId: string,
  ): Promise<{
    results: ExecutionResult[];
    summary: { total: number; completed: number; failed: number };
  }> {
    // Validate plan exists before executing
    await this.contentPlansService.getByIdOrFail(organizationId, planId);

    await this.contentPlansService.updateStatus(
      organizationId,
      planId,
      ContentPlanStatus.EXECUTING,
    );

    const pendingItems = await this.contentPlanItemsService.listPendingByPlan(
      organizationId,
      planId,
    );

    const results: ExecutionResult[] = [];
    let completed = 0;
    let failed = 0;

    for (const item of pendingItems) {
      const result = await this.executeItem(
        organizationId,
        brandId,
        userId,
        item,
      );

      results.push(result);

      if (result.status === ContentPlanItemStatus.COMPLETED) {
        completed++;
        await this.contentPlansService.incrementExecutedCount(
          organizationId,
          planId,
        );
      } else {
        failed++;
      }
    }

    const finalStatus =
      failed === pendingItems.length
        ? ContentPlanStatus.ACTIVE
        : ContentPlanStatus.COMPLETED;

    await this.contentPlansService.updateStatus(
      organizationId,
      planId,
      finalStatus,
    );

    this.logger.log(`${this.constructorName}: Plan execution completed`, {
      brandId,
      completed,
      failed,
      organizationId,
      planId,
      total: pendingItems.length,
    });

    return {
      results,
      summary: { completed, failed, total: pendingItems.length },
    };
  }

  async executeSingleItem(
    organizationId: string,
    brandId: string,
    userId: string,
    itemId: string,
  ): Promise<ExecutionResult> {
    const item = await this.contentPlanItemsService.getByIdOrFail(
      organizationId,
      itemId,
    );

    const result = await this.executeItem(
      organizationId,
      brandId,
      userId,
      item,
    );

    if (result.status === ContentPlanItemStatus.COMPLETED) {
      await this.contentPlansService.incrementExecutedCount(
        organizationId,
        String(item.plan),
      );
    }

    return result;
  }

  private async executeItem(
    organizationId: string,
    brandId: string,
    userId: string,
    item: ContentPlanItemDocument,
  ): Promise<ExecutionResult> {
    const itemId = String(item.id);

    await this.contentPlanItemsService.updateStatus(
      organizationId,
      itemId,
      ContentPlanItemStatus.EXECUTING,
    );

    try {
      if (item.type === ContentPlanItemType.SKILL) {
        return await this.executeSkillItem(
          organizationId,
          brandId,
          userId,
          item,
        );
      }

      return await this.executeMediaqueryItem(
        organizationId,
        brandId,
        userId,
        item,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown execution error';

      await this.contentPlanItemsService.updateStatus(
        organizationId,
        itemId,
        ContentPlanItemStatus.FAILED,
        { error: errorMessage },
      );

      this.logger.error(
        `${this.constructorName}: Item execution failed: ${errorMessage}`,
        { brandId, itemId, organizationId },
      );

      return {
        error: errorMessage,
        itemId,
        status: ContentPlanItemStatus.FAILED,
      };
    }
  }

  private async executeSkillItem(
    organizationId: string,
    brandId: string,
    userId: string,
    item: ContentPlanItemDocument,
  ): Promise<ExecutionResult> {
    const itemId = String(item.id);
    const skillSlug = item.skillSlug ?? 'content-writing';
    const itemPlatforms = item.platforms ?? [];
    const itemPrompt = item.prompt ?? undefined;
    const itemTopic = item.topic ?? undefined;

    const result = await this.skillExecutorService.execute(
      skillSlug,
      {
        brandId,
        brandVoice: '',
        organizationId,
        platforms: itemPlatforms,
      },
      {
        platforms: itemPlatforms,
        prompt: itemPrompt,
        topic: itemTopic,
      },
    );

    const post = await this.reviewablePostsService.create({
      brandId,
      confidence: result.draft.confidence,
      content: result.draft.content,
      contentRunId: result.runId,
      generatedBy: `content-engine:${skillSlug}`,
      idempotencyKey: `content-plan-item:${itemId}`,
      mediaUrls: result.draft.mediaUrls ?? [],
      metadata: {
        ...result.draft.metadata,
        contentPlanItemId: itemId,
        source: result.source,
      },
      organizationId,
      platforms: itemPlatforms,
      skillSlug,
      type: result.draft.type,
      userId,
    });

    const postId = String(post.id);

    await this.contentPlanItemsService.updateStatus(
      organizationId,
      itemId,
      ContentPlanItemStatus.COMPLETED,
      {
        confidence: result.draft.confidence,
        postId,
      },
    );

    return {
      itemId,
      postId,
      status: ContentPlanItemStatus.COMPLETED,
    };
  }

  private async executeMediaqueryItem(
    organizationId: string,
    brandId: string,
    userId: string,
    item: ContentPlanItemDocument,
  ): Promise<ExecutionResult> {
    const itemId = String(item.id);
    const itemPlatforms = item.platforms ?? [];
    const itemPrompt = item.prompt ?? undefined;

    if (!item.pipelineSteps || item.pipelineSteps.length === 0) {
      throw new Error(
        'Media pipeline item requires at least one pipeline step',
      );
    }

    const reviewContent = [
      item.prompt,
      item.topic,
      ...item.pipelineSteps.flatMap((step) => [
        step.prompt,
        step.text,
        step.imageUrl,
      ]),
    ]
      .find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0,
      )
      ?.trim();
    if (!reviewContent) {
      throw new Error('Media pipeline item requires non-empty content');
    }

    const steps: PipelineStep[] = item.pipelineSteps.map((step) => {
      switch (step.type) {
        case 'text-to-image':
          return {
            aspectRatio: step.aspectRatio,
            model: step.model as ImageTaskModel,
            prompt: step.prompt ?? itemPrompt,
            type: 'text-to-image' as const,
          };
        case 'image-to-video':
          return {
            aspectRatio: step.aspectRatio,
            duration: step.duration,
            imageUrl: step.imageUrl,
            model: step.model as VideoTaskModel,
            prompt: step.prompt,
            type: 'image-to-video' as const,
          };
        case 'text-to-speech':
          return {
            model: step.model as MusicTaskModel,
            text: step.text ?? itemPrompt,
            type: 'text-to-speech' as const,
            voiceId: step.voiceId ?? '',
          };
        case 'text-to-music':
          return {
            duration: step.duration,
            model: step.model as MusicTaskModel,
            prompt: step.prompt ?? itemPrompt,
            type: 'text-to-music' as const,
          };
        default:
          return {
            model: step.model as ImageTaskModel,
            prompt: step.prompt ?? itemPrompt,
            type: 'text-to-image' as const,
          };
      }
    });

    // ContentOrchestrationService requires a personaId which we don't have in the engine context.
    // For now, we create a draft record directly from the pipeline result.
    const pipelineResult =
      await this.contentOrchestrationService.generateAndPublish({
        brandId,
        organizationId,
        // The orchestration service requires a personaId — use brandId as a proxy.
        // In production, this should be resolved from the brand's linked persona.
        personaId: brandId,
        platforms: itemPlatforms,
        prompt: itemPrompt,
        publishMode: 'none',
        steps,
        userId,
      });

    if (pipelineResult.status === 'failed') {
      const errorMsg =
        pipelineResult.steps[0]?.error?.message ?? 'Pipeline execution failed';
      throw new Error(errorMsg);
    }

    // `postIds` is optional on PipelineResultV2 — a run that published nothing
    // omits it entirely, so read it defensively and fall through to creating a
    // reviewable post rather than assuming the array exists.
    const existingPostId = pipelineResult.postIds?.[0];
    const postId = existingPostId
      ? String(
          (
            await this.reviewablePostsService.requireOwnedPost(
              String(existingPostId),
              organizationId,
              brandId,
            )
          ).id,
        )
      : String(
          (
            await this.reviewablePostsService.create({
              brandId,
              content: reviewContent,
              generatedBy: 'content-engine:media-pipeline',
              idempotencyKey: `content-plan-item:${itemId}`,
              mediaUrls: pipelineResult.steps
                .filter((step) => step.result?.url)
                .map((step) => step.result?.url)
                .filter((url): url is string => Boolean(url)),
              metadata: {
                contentPlanItemId: itemId,
                pipelineStatus: pipelineResult.status,
              },
              organizationId,
              platforms: itemPlatforms,
              skillSlug: 'media-pipeline',
              type: 'media',
              userId,
            })
          ).id,
        );

    await this.contentPlanItemsService.updateStatus(
      organizationId,
      itemId,
      ContentPlanItemStatus.COMPLETED,
      { postId },
    );

    return {
      itemId,
      postId,
      status: ContentPlanItemStatus.COMPLETED,
    };
  }
}
