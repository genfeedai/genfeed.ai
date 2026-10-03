import {
  AGENT_VIDEO_MERGE_GATEWAY,
  type IAgentVideoMergeGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import {
  readMediaResponseString,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  findInapplicableMediaTransformParameters,
  isMediaTransformOperation,
  MEDIA_MERGE_ZOOM_UNSUPPORTED,
  MEDIA_REFRAME_ASPECT_RATIOS,
  MEDIA_TRANSFORM_OPERATIONS,
  MEDIA_TRANSFORM_RESULT_KINDS,
  type MediaTransformOperation,
} from '@genfeedai/actions';
import { IngredientCategory, Status } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Inject, Injectable } from '@nestjs/common';

const MERGE_OPTIONAL_PARAMETERS = [
  'isCaptionsEnabled',
  'isMuteVideoAudio',
  'isResizeEnabled',
  'music',
  'musicVolume',
  'transition',
  'transitionDuration',
  'transitionEaseCurve',
] as const;

function fail(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isVideoIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length >= 2 && value.every(isNonEmptyString)
  );
}

/**
 * Runtime owner of `transform_media`. Edit, reframe and upscale keep their
 * provider-backed implementations in the asset service; merge goes through the
 * generation gateway to the same orchestration the REST endpoint uses, so the
 * organization, user and brand scope and the DTO validation are shared.
 */
@Injectable()
export class AgentMediaTransformService {
  constructor(
    private readonly assetGeneration: AgentMediaAssetGenerationService,
    @Inject(AGENT_VIDEO_MERGE_GATEWAY)
    private readonly mergeGateway: IAgentVideoMergeGateway,
  ) {}

  async transformMedia(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const { operation } = params;
    if (!isMediaTransformOperation(operation)) {
      return fail(
        `operation must be one of: ${MEDIA_TRANSFORM_OPERATIONS.join(', ')}`,
      );
    }
    if (
      operation === 'merge' &&
      (params.zoomEaseCurve != null || params.zoomConfigs != null)
    ) {
      return fail(MEDIA_MERGE_ZOOM_UNSUPPORTED);
    }
    const inapplicable = findInapplicableMediaTransformParameters(
      operation,
      params,
    );
    if (inapplicable.length > 0) {
      return fail(
        `${inapplicable.join(', ')} ${inapplicable.length === 1 ? 'does' : 'do'} not apply to operation ${operation}`,
      );
    }

    const { operation: _operation, ...rest } = params;
    const result = await this.run(operation, rest, ctx);
    return result.success ? this.withKind(result, operation) : result;
  }

  private run(
    operation: MediaTransformOperation,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (operation) {
      case 'edit':
        return this.assetGeneration.editImage(params, ctx);
      case 'reframe':
        return this.reframe(params, ctx);
      case 'upscale':
        return this.upscale(params, ctx);
      case 'merge':
        return this.merge(params, ctx);
    }
  }

  private async reframe(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!isNonEmptyString(params.imageId)) {
      return fail('imageId is required for operation reframe');
    }
    if (
      params.aspectRatio !== undefined &&
      !MEDIA_REFRAME_ASPECT_RATIOS.some((ratio) => ratio === params.aspectRatio)
    ) {
      return fail(
        `aspectRatio must be one of: ${MEDIA_REFRAME_ASPECT_RATIOS.join(', ')} for operation reframe`,
      );
    }
    return this.assetGeneration.reframeImage(params, ctx);
  }

  private async upscale(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!isNonEmptyString(params.imageUrl)) {
      return fail('imageUrl is required for operation upscale');
    }
    return this.assetGeneration.upscaleImage(params, ctx);
  }

  private async merge(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!isVideoIdList(params.ids)) {
      return fail('ids must list at least two video ids');
    }
    const body: Record<string, unknown> = {
      category: IngredientCategory.VIDEO,
      ids: params.ids,
    };
    for (const key of MERGE_OPTIONAL_PARAMETERS) {
      if (params[key] !== undefined && params[key] !== null) {
        body[key] = params[key];
      }
    }

    try {
      const response = toMediaResponseRecord(
        await this.mergeGateway.mergeVideos({
          body,
          principal: {
            brandId: ctx.brandId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
          },
        }),
      );
      const id = readMediaResponseString(response, 'id');
      if (!id) {
        return fail('Video merge did not return an output id');
      }
      const status =
        readMediaResponseString(response, 'status') ?? Status.PROCESSING;

      return {
        creditsUsed: 0,
        data: { id, status },
        nextActions: [
          {
            assetId: id,
            assetKind: 'video',
            ctas: [
              {
                href: createLibraryAssetRoute(IngredientCategory.VIDEO, id),
                label: 'View in Library',
              },
            ],
            description: `Merging ${params.ids.length} videos into one clip.`,
            id: `video-merge-${id}`,
            status: 'processing',
            title: 'Video merge started',
            type: 'content_preview_card',
            videos: [],
          },
        ],
        success: true,
      };
    } catch (error: unknown) {
      return fail(
        error instanceof Error ? error.message : 'Video merge failed',
      );
    }
  }

  /** MCP cards read `kind` off the result data to pick image or video. */
  private withKind(
    result: AgentToolResult,
    operation: MediaTransformOperation,
  ): AgentToolResult {
    return {
      ...result,
      data: {
        ...(typeof result.data === 'object' && result.data !== null
          ? result.data
          : {}),
        kind: MEDIA_TRANSFORM_RESULT_KINDS[operation],
      },
    };
  }
}
