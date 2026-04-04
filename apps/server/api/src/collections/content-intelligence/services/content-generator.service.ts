import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import type { ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { ConfigService } from '@api/config/config.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

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

@Injectable()
export class ContentGeneratorService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly logger: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly patternStoreService: PatternStoreService,
    private readonly playbookBuilderService: PlaybookBuilderService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
  }

  async generateContent(
    organizationId: Types.ObjectId,
    dto: GenerateContentDto,
  ): Promise<GeneratedContent[]> {
    const variationsCount = dto.variationsCount ?? 3;
    const results: GeneratedContent[] = [];

    // Assemble brand context (all 6 layers) for LLM system prompt
    const brandContext = await this.contextAssemblyService.assembleContext({
      layers: {
        brandGuidance: true,
        brandIdentity: true,
        brandMemory: true,
        ragContext: true,
        recentPosts: true,
      },
      organizationId: organizationId.toString(),
      platform: dto.platform,
      query: dto.topic,
    });

    const systemPrompt = brandContext
      ? this.contextAssemblyService.buildSystemPrompt('', brandContext)
      : undefined;

    // Get patterns to use
    const patterns = await this.selectPatterns(organizationId, dto);

    if (patterns.length === 0) {
      // Generate without specific patterns
      const generated = await this.generateWithoutPatterns(
        dto,
        variationsCount,
        systemPrompt,
      );
      return generated;
    }

    // Get playbook insights if available
    let playbookInsights: PlaybookInsightsView | undefined;
    if (dto.playbookId) {
      const playbook = await this.playbookBuilderService.findOne({
        _id: new Types.ObjectId(dto.playbookId),
        isDeleted: false,
        organization: organizationId,
      });
      if (playbook) {
        playbookInsights = playbook.insights as unknown as PlaybookInsightsView;
      }
    }

    // Generate content using each pattern
    for (let i = 0; i < Math.min(patterns.length, variationsCount); i++) {
      const pattern = patterns[i];
      const generated = await this.generateFromPattern(
        dto,
        pattern,
        playbookInsights,
        systemPrompt,
      );
      results.push(generated);

      // Track pattern usage
      if (pattern._id) {
        await this.patternStoreService.incrementUsage(pattern._id);
      }
    }

    // Fill remaining slots with variations
    while (results.length < variationsCount) {
      const randomPattern =
        patterns[Math.floor(Math.random() * patterns.length)];
      const generated = await this.generateFromPattern(
        dto,
        randomPattern,
        playbookInsights,
        systemPrompt,
      );
      results.push(generated);
    }

    return results;
  }

  private async selectPatterns(
    organizationId: Types.ObjectId,
    dto: GenerateContentDto,
  ): Promise<ContentPatternDocument[]> {
    // If specific pattern is requested
    if (dto.patternId) {
      const pattern = await this.patternStoreService.findOne({
        _id: new Types.ObjectId(dto.patternId),
        isDeleted: false,
        organization: organizationId,
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
        hashtags: dto.hashtags ?? this.extractHashtags(parsed.content),
        hook: parsed.hook,
        patternId: pattern._id?.toString(),
        patternUsed: pattern.extractedFormula,
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
          hashtags: dto.hashtags ?? this.extractHashtags(variation),
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
      pattern.extractedFormula,
      1000,
    );
    const safeExample = SecurityUtil.sanitizePromptInput(
      pattern.rawExample.slice(0, 500),
      500,
    );

    let prompt = `Generate a ${dto.platform} post about: "${safeTopic}"

Use this proven pattern:
FORMULA: ${safeFormula}
EXAMPLE: ${safeExample}

PLACEHOLDERS TO FILL: ${pattern.placeholders.join(', ')}`;

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
    const safeContext = dto.additionalContext
      ? SecurityUtil.sanitizePromptInputArray(dto.additionalContext, 300)
      : [];

    return `Generate ${count} ${dto.platform} post variations about: "${safeTopic}"

Requirements:
1. Each post should have an engaging hook
2. Platform-appropriate length (${this.getPlatformLength(dto.platform)})
3. Include a subtle call to action
4. Natural, conversational tone

${safeContext.length > 0 ? `Context: ${safeContext.join(', ')}` : ''}

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
    let content = pattern.extractedFormula;

    // Simple placeholder replacement
    for (const placeholder of pattern.placeholders) {
      content = content.replace(
        new RegExp(`\\[${placeholder}\\]`, 'gi'),
        dto.topic,
      );
    }

    return {
      content,
      hashtags: dto.hashtags ?? [],
      patternId: pattern._id?.toString(),
      patternUsed: pattern.extractedFormula,
    };
  }

  private extractHashtags(text: string): string[] {
    const matches = text.match(/#\w+/g);
    return matches ? matches.map((tag) => tag.slice(1)) : [];
  }
}
