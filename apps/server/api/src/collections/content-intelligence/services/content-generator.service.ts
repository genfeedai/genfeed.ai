import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { type ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { TopPerformerPromptContextService } from '@api/collections/content-intelligence/services/top-performer-prompt-context.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  fitBrandContextToBudget,
} from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { LLM_DEFAULTS } from '@genfeedai/constants';
import {
  ContentIntelligencePlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { extractHashtags } from '@genfeedai/utils/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export const CONTENT_INTELLIGENCE_GENERATION_ACTION_ID =
  'content-intelligence.generate';
export const LINKEDIN_CONTENT_GENERATION_TOOL_ID = 'generate_linkedin_content';
const LINKEDIN_PATTERN_GENERATION_ACTION_ID =
  'content-intelligence.generate-linkedin-pattern';
const CONTENT_INTELLIGENCE_WORKFLOW_ID = 'content-intelligence.generation';
const LINKEDIN_CONTENT_WORKFLOW_ID = 'linkedin-content.generation';
const CONTENT_GENERATION_ACTION_IDS = {
  FINALIZE: 'content-intelligence.finalize',
  FREEFORM: 'content-intelligence.generate-freeform',
  LOAD_CONTEXT: 'content-intelligence.load-context',
  LOAD_PATTERNS: 'content-intelligence.load-patterns',
  PLAN: 'content-intelligence.plan',
  TRACK_PATTERN: 'content-intelligence.track-pattern',
} as const;
const CONTENT_INTELLIGENCE_CHILD_WORKFLOW_ID =
  'content-intelligence.generation.one';
const LINKEDIN_CONTENT_CHILD_WORKFLOW_ID = 'linkedin-content.generation.one';

function contentGenerationDefinition(
  canonicalId: string,
  childWorkflowId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [
        {
          id: 'context-plan',
          source: 'load-context',
          target: 'plan-generation',
          targetHandle: 'context',
        },
        {
          id: 'patterns-plan',
          source: 'load-patterns',
          target: 'plan-generation',
          targetHandle: 'patterns',
        },
        {
          id: 'plan-condition',
          source: 'plan-generation',
          target: 'has-patterns',
          targetHandle: 'value',
        },
        {
          id: 'plan-items',
          source: 'plan-generation',
          sourceHandle: 'items',
          target: 'generate-patterns',
          targetHandle: 'items',
        },
        {
          id: 'condition-patterns',
          source: 'has-patterns',
          sourceHandle: 'true',
          target: 'generate-patterns',
          targetHandle: 'condition',
        },
        {
          id: 'plan-freeform',
          source: 'plan-generation',
          target: 'generate-freeform',
          targetHandle: 'state',
        },
        {
          id: 'condition-freeform',
          source: 'has-patterns',
          sourceHandle: 'false',
          target: 'generate-freeform',
          targetHandle: 'condition',
        },
        {
          id: 'patterns-finalize',
          source: 'generate-patterns',
          target: 'finalize-generation',
          targetHandle: 'patternResults',
        },
        {
          id: 'freeform-finalize',
          source: 'generate-freeform',
          target: 'finalize-generation',
          targetHandle: 'freeformResults',
        },
      ],
      inputVariables: [
        { key: 'dto', label: 'Content request', required: true, type: 'json' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.LOAD_CONTEXT,
          id: 'load-context',
          inputVariableKeys: ['dto'],
        }),
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.LOAD_PATTERNS,
          id: 'load-patterns',
          inputVariableKeys: ['dto'],
        }),
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.PLAN,
          id: 'plan-generation',
          inputVariableKeys: ['dto'],
        }),
        {
          data: {
            config: {
              customField: 'hasPatterns',
              field: 'custom',
              operator: 'isTrue',
            },
            label: 'Patterns available?',
          },
          id: 'has-patterns',
          position: { x: 0, y: 0 },
          type: 'condition',
        },
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-patterns',
          parameters: {
            childWorkflowId,
            itemInputKey: 'item',
            maxConcurrency: 3,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.FREEFORM,
          id: 'generate-freeform',
        }),
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.FINALIZE,
          id: 'finalize-generation',
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: 'finalize-generation',
    version: 1,
  };
}

function contentGenerationChildDefinition(
  canonicalId: string,
  actionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [
        {
          id: 'generate-track',
          source: 'generate-pattern',
          target: 'track-pattern',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        {
          key: 'item',
          label: 'Pattern generation',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: 'generate-pattern',
          inputVariableKeys: ['item'],
        }),
        createGenfeedActionNode({
          actionId: CONTENT_GENERATION_ACTION_IDS.TRACK_PATTERN,
          id: 'track-pattern',
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: 'track-pattern',
    version: 1,
  };
}

export interface GeneratedContent {
  content: string;
  patternUsed: string;
  patternId?: string;
  hook?: string;
  body?: string;
  cta?: string;
  hashtags: string[];
}

type PlaybookInsightsView = {
  contentMix?: Record<string, number>;
  postingSchedule?: {
    bestTimes?: string[];
  };
  hashtagStrategy?: {
    optimalCount?: number;
  };
};

type ContentGenerationContext = {
  dto: GenerateContentDto;
  organizationId: string;
  playbookInsights?: PlaybookInsightsView;
  systemPrompt?: string;
};

type ContentGenerationItem = ContentGenerationContext & {
  pattern: ContentPatternDocument;
  trackUsage: boolean;
};

type GeneratedPatternState = ContentGenerationItem & {
  generated: GeneratedContent;
};

@Injectable()
export class ContentGeneratorService implements OnModuleInit {
  private readonly constructorName = this.constructor.name;
  private readonly defaultModel: string;

  constructor(
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly patternStoreService: PatternStoreService,
    private readonly playbookBuilderService: PlaybookBuilderService,
    @Optional()
    private readonly topPerformerPromptContextService?: TopPerformerPromptContextService,
    @Optional() private readonly personasService?: PersonasService,
    @Optional()
    private readonly harnessGenerationService?: HarnessGenerationService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    this.defaultModel = LLM_DEFAULTS.background;
  }

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction(
      CONTENT_GENERATION_ACTION_IDS.LOAD_CONTEXT,
      ({ context, input }) =>
        this.loadGenerationContext(
          context.organizationId,
          this.readGenerationDto(input.dto),
        ),
    );
    runner.registerAction(
      CONTENT_GENERATION_ACTION_IDS.LOAD_PATTERNS,
      ({ context, input }) =>
        this.selectPatterns(
          context.organizationId,
          this.readGenerationDto(input.dto),
        ),
    );
    runner.registerAction(CONTENT_GENERATION_ACTION_IDS.PLAN, ({ input }) =>
      this.planGeneration(
        input.context as ContentGenerationContext,
        input.patterns as ContentPatternDocument[],
      ),
    );
    runner.registerAction(
      CONTENT_INTELLIGENCE_GENERATION_ACTION_ID,
      ({ input }) =>
        this.generatePatternItem(input.item as ContentGenerationItem),
    );
    runner.registerAction(CONTENT_GENERATION_ACTION_IDS.FREEFORM, ({ input }) =>
      this.generateFreeformState(input.state as ContentGenerationContext),
    );
    runner.registerAction(
      CONTENT_GENERATION_ACTION_IDS.TRACK_PATTERN,
      ({ input }) =>
        this.trackPatternUsage(input.state as GeneratedPatternState),
    );
    runner.registerAction(CONTENT_GENERATION_ACTION_IDS.FINALIZE, ({ input }) =>
      this.finalizeGeneration(input),
    );
    runner.registerWorkflow(
      contentGenerationDefinition(
        CONTENT_INTELLIGENCE_WORKFLOW_ID,
        CONTENT_INTELLIGENCE_CHILD_WORKFLOW_ID,
        'Content Intelligence Generation',
      ),
    );
    runner.registerWorkflow(
      contentGenerationChildDefinition(
        CONTENT_INTELLIGENCE_CHILD_WORKFLOW_ID,
        CONTENT_INTELLIGENCE_GENERATION_ACTION_ID,
        'Generate One Content Pattern',
      ),
    );
    runner.registerWorkflow(
      contentGenerationDefinition(
        LINKEDIN_CONTENT_WORKFLOW_ID,
        LINKEDIN_CONTENT_CHILD_WORKFLOW_ID,
        'LinkedIn Content Generation',
      ),
    );
    runner.registerWorkflow(
      contentGenerationChildDefinition(
        LINKEDIN_CONTENT_CHILD_WORKFLOW_ID,
        LINKEDIN_PATTERN_GENERATION_ACTION_ID,
        'Generate One LinkedIn Content Pattern',
      ),
    );
    runner.registerAction(LINKEDIN_PATTERN_GENERATION_ACTION_ID, ({ input }) =>
      this.generatePatternItem({
        ...(input.item as ContentGenerationItem),
        dto: {
          ...(input.item as ContentGenerationItem).dto,
          platform: ContentIntelligencePlatform.LINKEDIN,
        },
      }),
    );
  }

  async generateContentWorkflow(
    userId: string | undefined,
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<GeneratedContent[]> {
    const actionId =
      dto.platform === ContentIntelligencePlatform.LINKEDIN
        ? LINKEDIN_CONTENT_GENERATION_TOOL_ID
        : CONTENT_INTELLIGENCE_GENERATION_ACTION_ID;
    const workflowId =
      dto.platform === ContentIntelligencePlatform.LINKEDIN
        ? LINKEDIN_CONTENT_WORKFLOW_ID
        : CONTENT_INTELLIGENCE_WORKFLOW_ID;
    const { result } = await this.requireWorkflowRunner().runWorkflow<
      GeneratedContent[]
    >({
      actionType: actionId,
      canonicalId: workflowId,
      inputValues: { dto },
      metadata: { brandId: dto.brandId, origin: 'api' },
      organizationId,
      source: 'ContentGeneratorService.generateContentWorkflow',
      trigger: WorkflowExecutionTrigger.API,
      userId,
    });
    return result;
  }

  generateContent(
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<GeneratedContent[]> {
    return this.generateContentWorkflow(undefined, organizationId, dto);
  }

  private async loadGenerationContext(
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<ContentGenerationContext> {
    const brandContext = await this.contextAssemblyService.assembleContext({
      brandId: dto.brandId?.toString?.(),
      layers: {
        brandGuidance: true,
        brandIdentity: true,
        brandMemory: true,
        performancePatterns: true,
        ragContext: true,
        recentPosts: true,
      },
      organizationId: organizationId.toString(),
      platform: dto.platform,
      query: dto.topic,
    });

    const baseSystemPrompt = brandContext
      ? this.contextAssemblyService.buildSystemPrompt('', brandContext, {
          maxBrandContextLength: Number.POSITIVE_INFINITY,
        })
      : undefined;
    const harnessSystemPrompt = await this.buildHarnessSystemPrompt(
      organizationId,
      dto,
    );
    const topPerformerSystemPrompt = await this.buildTopPerformerSystemPrompt(
      organizationId,
      dto,
    );
    const systemPrompt =
      fitBrandContextToBudget(
        [baseSystemPrompt, topPerformerSystemPrompt, harnessSystemPrompt],
        BRAND_CONTEXT_CHARACTER_BUDGET,
      ) || undefined;
    let playbookInsights: PlaybookInsightsView | undefined;
    if (dto.playbookId) {
      const playbook = await this.playbookBuilderService.findOne({
        id: dto.playbookId,
        organizationId: organizationId,
      });
      if (playbook) {
        playbookInsights = playbook.insights as unknown as PlaybookInsightsView;
      }
    }
    return { dto, organizationId, playbookInsights, systemPrompt };
  }

  private planGeneration(
    context: ContentGenerationContext,
    patterns: ContentPatternDocument[],
  ): {
    hasPatterns: boolean;
    items: ContentGenerationItem[];
  } {
    const count = context.dto.variationsCount ?? 3;
    if (patterns.length === 0) {
      return { hasPatterns: false, items: [] };
    }
    const directCount = Math.min(patterns.length, count);
    const items: ContentGenerationItem[] = [];
    for (let index = 0; index < count; index++) {
      const pattern =
        index < directCount
          ? patterns[index]
          : patterns[Math.floor(Math.random() * patterns.length)];
      items.push({ ...context, pattern, trackUsage: index < directCount });
    }
    return { hasPatterns: true, items };
  }

  private async generatePatternItem(
    item: ContentGenerationItem,
  ): Promise<GeneratedPatternState> {
    const generated = await this.generateFromPattern(
      item.dto,
      item.pattern,
      item.playbookInsights,
      item.systemPrompt,
    );
    return { ...item, generated };
  }

  private async trackPatternUsage(
    state: GeneratedPatternState,
  ): Promise<GeneratedContent> {
    if (state.trackUsage && state.pattern.id) {
      await this.patternStoreService.incrementUsage(state.pattern.id);
    }
    return state.generated;
  }

  private generateFreeformState(
    state: ContentGenerationContext,
  ): Promise<GeneratedContent[]> {
    return this.generateWithoutPatterns(
      state.dto,
      state.dto.variationsCount ?? 3,
      state.systemPrompt,
    );
  }

  private finalizeGeneration(
    input: Record<string, unknown>,
  ): GeneratedContent[] {
    if (Array.isArray(input.freeformResults)) {
      return input.freeformResults as GeneratedContent[];
    }
    const patternResults = input.patternResults as
      | { results?: Array<{ result?: GeneratedContent }> }
      | undefined;
    return (patternResults?.results ?? []).flatMap(({ result }) =>
      result ? [result] : [],
    );
  }

  private async selectPatterns(
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<ContentPatternDocument[]> {
    // If specific pattern is requested
    if (dto.patternId) {
      const pattern = await this.patternStoreService.findOne({
        id: dto.patternId,
        organizationId: organizationId,
      });
      return pattern ? [pattern] : [];
    }

    // Filter patterns by criteria
    return this.patternStoreService.findByOrganization(organizationId, {
      patternType: dto.patternType,
      platform: dto.platform,
      templateCategory: dto.templateCategory,
    });
  }

  private async buildHarnessSystemPrompt(
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<string | undefined> {
    if (
      !dto.brandId ||
      !this.personasService ||
      !this.harnessGenerationService
    ) {
      return undefined;
    }

    try {
      const persona = await this.personasService.findOne({
        brandId: dto.brandId,
        organizationId: organizationId,
      });

      // Single seam: HarnessGenerationService.resolveBrief is the only place
      // that folds pgvector brand content memory into the brief (#3020).
      // `includeContentMemory` is intentionally left unset so resolveBrief's
      // own gate (`includeContentMemory ?? Boolean(topic?.trim())`) decides —
      // passing `topic` through is what drives that gate here.
      const brief = await this.harnessGenerationService.resolveBrief({
        additionalSources:
          dto.additionalContext?.map((content, index) => ({
            content,
            id: `content-context-${index}`,
            kind: 'audience_signal',
          })) ?? [],
        brandId: dto.brandId,
        contentType: 'post',
        objective: 'engagement',
        organizationId,
        persona,
        platform: dto.platform,
        topic: dto.topic,
      });

      const formattedBrief = this.harnessGenerationService.formatBrief(brief);
      return formattedBrief || undefined;
    } catch {
      return undefined;
    }
  }

  private async buildTopPerformerSystemPrompt(
    organizationId: string,
    dto: GenerateContentDto,
  ): Promise<string | undefined> {
    if (!this.topPerformerPromptContextService || !dto.brandId) {
      return undefined;
    }

    try {
      return await this.topPerformerPromptContextService.assembleContext({
        brandId: dto.brandId,
        organizationId: organizationId.toString(),
        platform: dto.platform,
        query: dto.topic,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName}: Top performer context assembly failed`,
        error,
      );
      return undefined;
    }
  }

  private async generateFromPattern(
    dto: GenerateContentDto,
    pattern: ContentPatternDocument,
    playbookInsights?: PlaybookInsightsView,
    systemPrompt?: string,
  ): Promise<GeneratedContent> {
    const prompt = this.buildGenerationPrompt(dto, pattern, playbookInsights);

    try {
      const response = await this.callLLM(prompt, systemPrompt);
      const parsed = this.parseGeneratedContent(response);

      return {
        body: parsed.body,
        content: parsed.content,
        cta: parsed.cta,
        hashtags: dto.hashtags ?? extractHashtags(parsed.content),
        hook: parsed.hook,
        patternId: pattern.id?.toString(),
        patternUsed: pattern.extractedFormula ?? 'pattern',
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName}: Generation failed`, error);

      // Fallback: simple template fill
      return this.fillPatternTemplate(dto, pattern);
    }
  }

  private async generateWithoutPatterns(
    dto: GenerateContentDto,
    count: number,
    systemPrompt?: string,
  ): Promise<GeneratedContent[]> {
    const results: GeneratedContent[] = [];
    const prompt = this.buildFreeformPrompt(dto, count);

    try {
      const response = await this.callLLM(prompt, systemPrompt);
      const variations = this.parseFreeformResponse(response);

      for (const variation of variations.slice(0, count)) {
        results.push({
          content: variation,
          hashtags: dto.hashtags ?? extractHashtags(variation),
          patternUsed: 'freeform',
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}: Freeform generation failed`,
        error,
      );
    }

    return results;
  }

  private buildGenerationPrompt(
    dto: GenerateContentDto,
    pattern: ContentPatternDocument,
    playbookInsights?: PlaybookInsightsView,
  ): string {
    // Sanitize user-provided inputs to prevent prompt injection
    const safeTopic = SecurityUtil.sanitizePromptInput(dto.topic, 500);
    const safeFormula = SecurityUtil.sanitizePromptInput(
      pattern.extractedFormula ?? '',
      1000,
    );
    const safeExample = SecurityUtil.sanitizePromptInput(
      pattern.rawExample?.slice(0, 500) ?? '',
      500,
    );
    const placeholders = pattern.placeholders ?? [];

    let prompt = `Generate a ${dto.platform} post about: "${safeTopic}"

Use this proven pattern:
FORMULA: ${safeFormula}
EXAMPLE: ${safeExample}

PLACEHOLDERS TO FILL: ${placeholders.join(', ')}`;

    if (playbookInsights) {
      prompt += `

BEST PRACTICES FROM TOP PERFORMERS:
- Content mix suggests focusing on: ${Object.entries(
        playbookInsights.contentMix || {},
      )
        .filter(([, v]) => (v as number) > 0.1)
        .map(([k]) => k)
        .join(', ')}
- Best posting times: ${(playbookInsights.postingSchedule?.bestTimes || []).join(', ')}
- Optimal hashtag count: ${playbookInsights.hashtagStrategy?.optimalCount || 5}`;
    }

    if (dto.additionalContext && dto.additionalContext.length > 0) {
      const safeContext = SecurityUtil.sanitizePromptInputArray(
        dto.additionalContext,
        500,
      );
      prompt += `

ADDITIONAL CONTEXT:
${safeContext.join('\n')}`;
    }

    prompt += `

RESPOND WITH JSON:
{
  "content": "The complete post",
  "hook": "The opening hook",
  "body": "The main body",
  "cta": "Call to action if any"
}`;

    return prompt;
  }

  private buildFreeformPrompt(dto: GenerateContentDto, count: number): string {
    // Sanitize user-provided inputs to prevent prompt injection
    const safeTopic = SecurityUtil.sanitizePromptInput(dto.topic, 500);
    // 500 matches the pattern-path cap so batch diversity captions (≤280 for X)
    // survive as individual additionalContext lines.
    const safeContext = dto.additionalContext
      ? SecurityUtil.sanitizePromptInputArray(dto.additionalContext, 500)
      : [];

    return `Generate ${count} ${dto.platform} post variations about: "${safeTopic}"

Requirements:
1. Each post should have an engaging hook
2. Platform-appropriate length (${this.getPlatformLength(dto.platform)})
3. Include a subtle call to action
4. Natural, conversational tone
5. When generating multiple posts, each must use a different angle, opener, and structure — not a light rewrite of the same line

${safeContext.length > 0 ? `Context:\n${safeContext.join('\n')}` : ''}

Respond with JSON array:
[
  { "content": "Post 1" },
  { "content": "Post 2" },
  ...
]`;
  }

  private getPlatformLength(platform: string): string {
    switch (platform) {
      case 'twitter':
        return '280 characters max';
      case 'linkedin':
        return '1500-3000 characters';
      case 'instagram':
        return '300-500 characters';
      case 'tiktok':
        return '150-300 characters';
      default:
        return '500-1000 characters';
    }
  }

  private async callLLM(
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    const response = await this.openRouterService.chatCompletion({
      max_tokens: 2000,
      messages: [
        ...(systemPrompt
          ? [{ content: systemPrompt, role: 'system' as const }]
          : []),
        { content: prompt, role: 'user' as const },
      ],
      model: this.defaultModel,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || '';
  }

  private parseGeneratedContent(response: string): {
    content: string;
    hook?: string;
    body?: string;
    cta?: string;
  } {
    try {
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(jsonStr);
      return {
        body: parsed.body,
        content: parsed.content || response,
        cta: parsed.cta,
        hook: parsed.hook,
      };
    } catch {
      return { content: response };
    }
  }

  private parseFreeformResponse(response: string): string[] {
    try {
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((p: unknown) =>
          typeof p === 'object' && p !== null && 'content' in p
            ? String((p as { content?: string }).content || '')
            : String(p),
        );
      }
      return [response];
    } catch {
      return [response];
    }
  }

  private fillPatternTemplate(
    dto: GenerateContentDto,
    pattern: ContentPatternDocument,
  ): GeneratedContent {
    let content = pattern.extractedFormula ?? dto.topic;
    const placeholders = pattern.placeholders ?? [];

    // Simple placeholder replacement
    for (const placeholder of placeholders) {
      content = content.replace(
        new RegExp(`\\[${placeholder}\\]`, 'gi'),
        dto.topic,
      );
    }

    return {
      content,
      hashtags: dto.hashtags ?? [],
      patternId: pattern.id?.toString(),
      patternUsed: pattern.extractedFormula ?? 'pattern',
    };
  }

  private readGenerationDto(
    value: unknown,
    defaultPlatform?: ContentIntelligencePlatform,
  ): GenerateContentDto {
    const input =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    if (typeof input.topic !== 'string' || input.topic.trim().length === 0) {
      throw new Error('Missing required content generation input: topic');
    }
    const platform =
      Object.values(ContentIntelligencePlatform).find(
        (candidate) => candidate === input.platform,
      ) ?? defaultPlatform;
    if (!platform) {
      throw new Error('Missing required content generation input: platform');
    }
    return {
      ...input,
      platform,
      topic: input.topic.trim(),
    } as GenerateContentDto;
  }

  private requireWorkflowRunner(): SystemWorkflowRunnerService {
    if (!this.moduleRef) {
      throw new Error('Workflow action runner is unavailable');
    }
    return this.moduleRef.get(SystemWorkflowRunnerService, { strict: false });
  }
}
