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
import { Injectable, type OnModuleInit } from '@nestjs/common';

type PostState = AiInfluencerWorkflowRequest & {
  caption?: string;
  imageConfig?: ImageGenerationConfig;
  imageUrl?: string;
  ingredientId?: string;
  persona: PersonaDocument;
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

  private planPublish(request: SystemWorkflowActionRequest): {
    items: PlatformItem[];
    state: PostState;
  } {
    const state = this.readPostState(request.input.state, [
      'caption',
      'imageUrl',
      'ingredientId',
    ]);
    return {
      items: state.platforms.map((platform) => ({ ...state, platform })),
      state,
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
