import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

export interface PublishAsset {
  assetId: string;
  mediaUrl: string;
  mimeType: string;
  caption?: string;
}

export interface PublishHandoffPayload {
  assets: PublishAsset[];
  clipProjectId: string;
  confirmBeforePublish: true;
  metadata?: Record<string, unknown>;
  platforms: string[];
  preparedAt: string;
  schedule: 'immediate' | 'scheduled';
}

export interface PrepareHandoffOptions {
  assets?: Record<
    string,
    { mediaUrl: string; mimeType: string; caption?: string }
  >;
  metadata?: Record<string, unknown>;
  platforms?: string[];
  schedule?: 'immediate' | 'scheduled';
}

type PreparePublishHandoffInput = {
  assetIds: string[];
  clipProjectId: string;
  options?: PrepareHandoffOptions;
};

@Injectable()
export class ClipPublishHandoffWorkflowService implements OnModuleInit {
  private static readonly ACTION_ID = 'clip.handoff.prepare-publish';

  constructor(
    private readonly logger: LoggerService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      ClipPublishHandoffWorkflowService.ACTION_ID,
      (request) => this.execute(request),
    );
  }

  async preparePublishHandoff(
    input: PreparePublishHandoffInput,
    context: { organizationId: string; userId: string },
  ): Promise<PublishHandoffPayload> {
    const { result } =
      await this.workflowRunner.runAction<PublishHandoffPayload>({
        actionType: 'clip-publish-handoff',
        canonicalId: ClipPublishHandoffWorkflowService.ACTION_ID,
        inputValues: input,
        organizationId: context.organizationId,
        source: 'clip-project-handoff',
        userId: context.userId,
      });
    return result;
  }

  private execute(request: SystemWorkflowActionRequest): PublishHandoffPayload {
    const input = this.readInput(request.input);
    const platforms = input.options?.platforms ?? ['instagram'];
    const schedule = input.options?.schedule ?? 'immediate';
    const assets = input.assetIds.map((assetId) => ({
      ...(input.options?.assets?.[assetId]?.caption
        ? { caption: input.options.assets[assetId]?.caption }
        : {}),
      assetId,
      mediaUrl: input.options?.assets?.[assetId]?.mediaUrl ?? assetId,
      mimeType: input.options?.assets?.[assetId]?.mimeType ?? 'video/mp4',
    }));
    const payload: PublishHandoffPayload = {
      assets,
      clipProjectId: input.clipProjectId,
      confirmBeforePublish: true,
      ...(input.options?.metadata ? { metadata: input.options.metadata } : {}),
      platforms,
      preparedAt: new Date().toISOString(),
      schedule,
    };
    this.logger.log('Clip publish handoff prepared', {
      assetCount: assets.length,
      clipProjectId: input.clipProjectId,
      platforms,
      schedule,
    });
    return payload;
  }

  private readInput(
    value: Record<string, unknown>,
  ): PreparePublishHandoffInput {
    const clipProjectId = value.clipProjectId;
    const assetIds = value.assetIds;
    if (typeof clipProjectId !== 'string' || clipProjectId.length === 0) {
      throw new Error('clipProjectId is required');
    }
    if (
      !Array.isArray(assetIds) ||
      assetIds.length === 0 ||
      !assetIds.every((assetId) => typeof assetId === 'string')
    ) {
      throw new Error('At least one asset ID is required');
    }
    const options =
      value.options !== null &&
      typeof value.options === 'object' &&
      !Array.isArray(value.options)
        ? (value.options as PrepareHandoffOptions)
        : undefined;
    return { assetIds, clipProjectId, ...(options ? { options } : {}) };
  }
}
