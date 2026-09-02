import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AiInfluencerService,
  type GeneratePostResult,
  type ImageGenerationConfig,
  type PlatformPublishResult,
} from '@api/services/ai-influencer/ai-influencer.service';
import {
  AI_INFLUENCER_ACTION_IDS,
  AI_INFLUENCER_WORKFLOW_DEFINITIONS,
  AI_INFLUENCER_WORKFLOW_IDS,
  type AiInfluencerWorkflowRequest,
  findAiInfluencerWorkflowDefinition,
} from '@api/services/ai-influencer/ai-influencer-workflow-definition';
import type { GenerationResult } from '@api/services/persona-content/persona-content.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type PostState = AiInfluencerWorkflowRequest & {
  caption?: string;
  imageConfig?: ImageGenerationConfig;
  imageUrl?: string;
  ingredientId?: string;
  persona: PersonaDocument;
  videoResult?: GenerationResult;
  voiceResult?: GenerationResult;
};

type PlatformItem = PostState & {
  platform: AiInfluencerWorkflowRequest['platforms'][number];
};

type ForEachResult = {
  count: number;
  results: Array<{ index: number; result: unknown }>;
};

@Injectable()
export class AiInfluencerWorkflowService implements OnModuleInit {
  constructor(
    private readonly aiInfluencer: AiInfluencerService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    const actions = [
      [AI_INFLUENCER_ACTION_IDS.PERSONA_LOAD, this.loadPersona.bind(this)],
      [
        AI_INFLUENCER_ACTION_IDS.CAPTION_GENERATE,
        this.generateCaption.bind(this),
      ],
      [AI_INFLUENCER_ACTION_IDS.IMAGE_PREPARE, this.prepareImage.bind(this)],
      [AI_INFLUENCER_ACTION_IDS.IMAGE_GENERATE, this.generateImage.bind(this)],
      [
        AI_INFLUENCER_ACTION_IDS.INGREDIENT_CREATE,
        this.createIngredient.bind(this),
      ],
      [AI_INFLUENCER_ACTION_IDS.VIDEO_PLAN, this.planVideo.bind(this)],
      [AI_INFLUENCER_ACTION_IDS.VOICE_GENERATE, this.generateVoice.bind(this)],
      [AI_INFLUENCER_ACTION_IDS.VIDEO_GENERATE, this.generateVideo.bind(this)],
      [AI_INFLUENCER_ACTION_IDS.PUBLISH_PLAN, this.planPublish.bind(this)],
      [
        AI_INFLUENCER_ACTION_IDS.PLATFORM_PUBLISH,
        this.publishPlatform.bind(this),
      ],
      [AI_INFLUENCER_ACTION_IDS.POST_FINALIZE, this.finalizePost.bind(this)],
      [
        AI_INFLUENCER_ACTION_IDS.DAILY_DISCOVER,
        this.discoverDailyPersonas.bind(this),
      ],
      [
        AI_INFLUENCER_ACTION_IDS.DAILY_PREPARE,
        this.prepareDailyPost.bind(this),
      ],
      [AI_INFLUENCER_ACTION_IDS.DAILY_MARK_RUN, this.markDailyRun.bind(this)],
      [
        AI_INFLUENCER_ACTION_IDS.DAILY_FINALIZE,
        this.finalizeDailyPosts.bind(this),
      ],
    ] as const;
    for (const [actionId, execute] of actions) {
      this.workflowRunner.registerAction(actionId, execute);
    }
    for (const definition of AI_INFLUENCER_WORKFLOW_DEFINITIONS) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  async generatePost(
    request: AiInfluencerWorkflowRequest,
    userId?: string,
  ): Promise<GeneratePostResult> {
    const definition = findAiInfluencerWorkflowDefinition(
      AI_INFLUENCER_WORKFLOW_IDS.GENERATE_POST,
    );
    const { result } =
      await this.workflowRunner.runWorkflow<GeneratePostResult>({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'AiInfluencerWorkflowService.generatePost',
        userId,
      });
    return result;
  }

  async runDailyPosts(
    organizationId: string,
    userId?: string,
  ): Promise<{ generated: number; results: GeneratePostResult[] }> {
    const definition = findAiInfluencerWorkflowDefinition(
      AI_INFLUENCER_WORKFLOW_IDS.DAILY_POSTS,
    );
    const { result } = await this.workflowRunner.runWorkflow<{
      generated: number;
      results: GeneratePostResult[];
    }>({
      actionType: definition.canonicalId,
      canonicalId: definition.canonicalId,
      organizationId,
      source: 'AiInfluencerWorkflowService.runDailyPosts',
      userId,
    });
    return result;
  }

  private async loadPersona(
    request: SystemWorkflowActionRequest,
  ): Promise<PostState> {
    const input = this.readPostRequest(request);
    const persona = await this.aiInfluencer.loadPersona(
      input.personaSlug,
      input.organizationId,
    );
    return { ...input, persona };
  }

  private async generateCaption(
    request: SystemWorkflowActionRequest,
  ): Promise<PostState> {
    const state = this.readPostState(request.input.state);
    const caption =
      state.captionOverride ??
      (await this.aiInfluencer.generateCaption(state.persona));
    return { ...state, caption };
  }

  private prepareImage(request: SystemWorkflowActionRequest): PostState {
    const state = this.readPostState(request.input.state, ['caption']);
    return {
      ...state,
      imageConfig: this.aiInfluencer.buildImageConfig(state.persona, {
        aspectRatio: state.aspectRatio,
        promptOverride: state.promptOverride,
      }),
    };
  }

  private async generateImage(
    request: SystemWorkflowActionRequest,
  ): Promise<PostState> {
    const state = this.readPostState(request.input.state, [
      'caption',
      'imageConfig',
    ]);
    return {
      ...state,
      imageUrl: await this.aiInfluencer.generateImage(
        state.imageConfig as ImageGenerationConfig,
      ),
    };
  }

  private async createIngredient(
    request: SystemWorkflowActionRequest,
  ): Promise<PostState> {
    const state = this.readPostState(request.input.state, [
      'caption',
      'imageUrl',
    ]);
    const ingredient = await this.aiInfluencer.createIngredientRecord(
      state.persona,
      state.imageUrl as string,
      state.caption as string,
    );
    return { ...state, ingredientId: ingredient.id.toString() };
  }

  private planVideo(request: SystemWorkflowActionRequest): {
    state: PostState;
    videoItems: PostState[];
    voiceItems: PostState[];
  } {
    const state = this.readPostState(request.input.state, [
      'caption',
      'imageUrl',
      'ingredientId',
    ]);
    const requiresVideo =
      state.platforms.includes('tiktok') || state.platforms.includes('youtube');
    return {
      state,
      videoItems: requiresVideo ? [state] : [],
      voiceItems: requiresVideo ? [state] : [],
    };
  }

  private generateVoice(request: SystemWorkflowActionRequest) {
    const state = this.readPostState(request.input.request, [
      'caption',
      'ingredientId',
    ]);
    return this.aiInfluencer.generateVoice(
      state.persona,
      state.caption as string,
      state.ingredientId as string,
    );
  }

  private generateVideo(request: SystemWorkflowActionRequest) {
    const state = this.readPostState(request.input.request, ['caption']);
    return this.aiInfluencer.generateVideo(
      state.persona,
      state.caption as string,
    );
  }

  private planPublish(request: SystemWorkflowActionRequest): {
    items: PlatformItem[];
    state: PostState;
  } {
    const plan = this.readRecord(request.input.state, 'video plan');
    const state = this.readPostState(plan.state, [
      'caption',
      'imageUrl',
      'ingredientId',
    ]);
    const voiceResult = this.firstChildResult(request.input.voiceBatch);
    const videoResult = this.firstChildResult(request.input.videoBatch);
    const completed = {
      ...state,
      ...(videoResult ? { videoResult: videoResult as GenerationResult } : {}),
      ...(voiceResult ? { voiceResult: voiceResult as GenerationResult } : {}),
    };
    return {
      items: completed.platforms.map((platform) => ({
        ...completed,
        platform,
      })),
      state: completed,
    };
  }

  private publishPlatform(
    request: SystemWorkflowActionRequest,
  ): Promise<PlatformPublishResult> {
    const item = this.readPlatformItem(request.input.request);
    return this.aiInfluencer.publishToPlatform(
      item.platform as Parameters<AiInfluencerService['publishToPlatform']>[0],
      item.imageUrl as string,
      item.caption as string,
      item.persona,
      item.videoResult && item.voiceResult
        ? { videoResult: item.videoResult, voiceResult: item.voiceResult }
        : undefined,
    );
  }

  private finalizePost(
    request: SystemWorkflowActionRequest,
  ): GeneratePostResult {
    const state = this.readPostState(request.input.state, [
      'caption',
      'imageUrl',
      'ingredientId',
    ]);
    const publishBatch = this.readForEachResult(request.input.publishBatch);
    return {
      caption: state.caption as string,
      imageUrl: state.imageUrl as string,
      ingredientId: state.ingredientId as string,
      personaSlug: state.personaSlug,
      publishResults: [...publishBatch.results]
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.result as PlatformPublishResult),
      ...(state.videoResult ? { videoResult: state.videoResult } : {}),
      ...(state.voiceResult ? { voiceResult: state.voiceResult } : {}),
    };
  }

  private async discoverDailyPersonas(
    request: SystemWorkflowActionRequest,
  ): Promise<{ items: AiInfluencerWorkflowRequest[] }> {
    const organizationId = request.context.organizationId;
    const personas =
      await this.aiInfluencer.discoverAutopilotPersonas(organizationId);
    return {
      items: personas.map((persona) => ({
        organizationId,
        personaSlug: this.requiredString(persona.slug, 'persona.slug'),
        platforms: this.readPersonaPlatforms(persona),
      })),
    };
  }

  private prepareDailyPost(request: SystemWorkflowActionRequest): {
    items: AiInfluencerWorkflowRequest[];
  } {
    return { items: [this.readPostRequest(request)] };
  }

  private async markDailyRun(
    request: SystemWorkflowActionRequest,
  ): Promise<GeneratePostResult> {
    const input = this.readPostRequest(request);
    const batch = this.readForEachResult(request.input.postBatch);
    const result = batch.results.at(0)?.result as
      | GeneratePostResult
      | undefined;
    if (!result) {
      throw new Error('AI influencer daily post completed without result');
    }
    const persona = await this.aiInfluencer.loadPersona(
      input.personaSlug,
      input.organizationId,
    );
    await this.aiInfluencer.markAutopilotRun(persona.id.toString());
    return result;
  }

  private finalizeDailyPosts(request: SystemWorkflowActionRequest): {
    generated: number;
    results: GeneratePostResult[];
  } {
    const batch = this.readForEachResult(request.input.batch);
    return {
      generated: batch.count,
      results: [...batch.results]
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.result as GeneratePostResult),
    };
  }

  private readPostRequest(
    request: SystemWorkflowActionRequest,
  ): AiInfluencerWorkflowRequest {
    const input =
      request.input.request && typeof request.input.request === 'object'
        ? this.readRecord(request.input.request, 'request')
        : {};
    const organizationId =
      this.optionalString(input.organizationId) ??
      request.context.organizationId;
    if (organizationId !== request.context.organizationId) {
      throw new Error('AI influencer workflow organization mismatch');
    }
    const platforms = Array.isArray(input.platforms)
      ? input.platforms.filter(
          (platform): platform is string => typeof platform === 'string',
        )
      : [];
    const aspectRatio = this.optionalString(input.aspectRatio);
    const captionOverride = this.optionalString(input.captionOverride);
    const promptOverride = this.optionalString(input.promptOverride);
    return {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(captionOverride ? { captionOverride } : {}),
      organizationId,
      personaSlug: this.requiredString(input.personaSlug, 'personaSlug'),
      platforms: this.aiInfluencer.validatePlatforms(platforms),
      ...(promptOverride ? { promptOverride } : {}),
    };
  }

  private readPostState(
    value: unknown,
    required: Array<
      'caption' | 'imageConfig' | 'imageUrl' | 'ingredientId'
    > = [],
  ): PostState {
    const record = this.readRecord(value, 'post state');
    const persona = this.readRecord(
      record.persona,
      'persona',
    ) as PersonaDocument;
    const aspectRatio = this.optionalString(record.aspectRatio);
    const caption = this.optionalString(record.caption);
    const captionOverride = this.optionalString(record.captionOverride);
    const imageUrl = this.optionalString(record.imageUrl);
    const ingredientId = this.optionalString(record.ingredientId);
    const promptOverride = this.optionalString(record.promptOverride);
    const state: PostState = {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(caption ? { caption } : {}),
      ...(captionOverride ? { captionOverride } : {}),
      ...(record.imageConfig
        ? { imageConfig: record.imageConfig as ImageGenerationConfig }
        : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(ingredientId ? { ingredientId } : {}),
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      persona,
      personaSlug: this.requiredString(record.personaSlug, 'personaSlug'),
      platforms: Array.isArray(record.platforms)
        ? record.platforms.filter(
            (platform): platform is string => typeof platform === 'string',
          )
        : [],
      ...(promptOverride ? { promptOverride } : {}),
      ...(record.videoResult
        ? { videoResult: record.videoResult as GenerationResult }
        : {}),
      ...(record.voiceResult
        ? { voiceResult: record.voiceResult as GenerationResult }
        : {}),
    };
    for (const field of required) {
      if (!state[field]) {
        throw new Error(`AI influencer workflow requires ${field}`);
      }
    }
    return state;
  }

  private readPlatformItem(value: unknown): PlatformItem {
    const state = this.readPostState(value, [
      'caption',
      'imageUrl',
      'ingredientId',
    ]);
    const record = this.readRecord(value, 'platform item');
    return {
      ...state,
      platform: this.requiredString(record.platform, 'platform'),
    };
  }

  private firstChildResult(value: unknown): unknown {
    return this.readForEachResult(value).results.at(0)?.result;
  }

  private readForEachResult(value: unknown): ForEachResult {
    const record = this.readRecord(value, 'for-each result');
    if (!Array.isArray(record.results)) {
      throw new Error('AI influencer workflow requires child results');
    }
    return {
      count: this.requiredNumber(record.count, 'count'),
      results: record.results.map((item) => {
        const entry = this.readRecord(item, 'child result');
        return {
          index: this.requiredNumber(entry.index, 'index'),
          result: entry.result,
        };
      }),
    };
  }

  private readPersonaPlatforms(persona: PersonaDocument): string[] {
    const record = persona as Record<string, unknown>;
    const strategy = this.readRecord(record.contentStrategy ?? {}, 'strategy');
    const platforms = Array.isArray(strategy.platforms)
      ? strategy.platforms.filter(
          (platform): platform is string => typeof platform === 'string',
        )
      : [];
    return platforms.length > 0 ? platforms : ['instagram', 'twitter'];
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`AI influencer workflow requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`AI influencer workflow requires ${field}`);
    }
    return value.trim();
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`AI influencer workflow requires numeric ${field}`);
    }
    return value;
  }
}
