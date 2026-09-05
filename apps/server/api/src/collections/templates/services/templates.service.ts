import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';
import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';
import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';
import type { TemplateDocument } from '@api/collections/templates/schemas/template.schema';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import type {
  Prisma,
  Template as StoredTemplate,
  TemplateMetadata,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';

type Template = TemplateDocument;

/**
 * The template placeholder grammar: `{{variable_name}}`.
 *
 * Returned fresh per call so each caller owns its own `lastIndex` — a shared
 * global regex leaks match position between `extractVariables` and
 * `fillVariables`.
 */
function templateVariablePattern(): RegExp {
  return /\{\{(\w+)\}\}/g;
}

function templateConfig(value: Prisma.JsonValue): Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function toTemplateDocument(
  template: StoredTemplate & { metadata?: TemplateMetadata | null },
): TemplateDocument {
  return {
    ...templateConfig(template.config),
    ...template,
    ...(template.metadata
      ? {
          metadata: {
            ...templateConfig(template.metadata.data),
            ...template.metadata,
          },
        }
      : {}),
  } as TemplateDocument;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateUsageService: TemplateUsageService,
    private readonly templateMetadataService: TemplateMetadataService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {
    this.registerHandlebarsHelpers();
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper(
      'ifAny',
      function (this: unknown, ...args: unknown[]) {
        const options = args[args.length - 1] as Handlebars.HelperOptions;
        const values = args.slice(0, -1);

        for (const value of values) {
          if (value) {
            return options.fn(this);
          }
        }

        return options.inverse(this);
      },
    );
  }

  /**
   * Create a new template
   */
  @HandleErrors('create template', 'templates')
  async create(
    dto: CreateTemplateDto,
    organization?: string,
    userId?: string,
  ): Promise<Template> {
    this.logger.debug('Creating template', {
      label: dto.label,
      organization,
      purpose: dto.purpose,
    });

    // Extract variables from template content
    const extractedVariables = this.extractVariables(dto.content);

    // Merge extracted with provided variables
    const variables = dto.variables || extractedVariables;

    // Validate key uniqueness for prompt templates
    if (dto.purpose === 'prompt' && dto.key) {
      const existing = await this.prisma.template.findFirst({
        where: {
          isDeleted: false,
          key: dto.key,
          organizationId: organization || null,
          purpose: 'prompt',
        },
      });
      if (existing) {
        throw new Error(`Template with key "${dto.key}" already exists`);
      }
    }

    const { content, description, tags, metadata, ...templateScalars } = dto;

    const template = await this.prisma.template.create({
      data: {
        ...templateScalars,
        config: {
          content,
          description,
          ...(tags !== undefined ? { tags } : {}),
        },
        createdById: userId,
        isActive: dto.isActive ?? (dto.purpose === 'prompt' ? true : undefined),
        organizationId: organization || null,
        variables: variables as Prisma.InputJsonValue,
        version: dto.version ?? (dto.purpose === 'prompt' ? 1 : undefined),
      },
    });

    const templateId = template.id;

    const savedMetadata = await this.templateMetadataService.create(
      templateId,
      {
        author: metadata?.author,
        compatiblePlatforms: metadata?.compatiblePlatforms,
        difficulty: metadata?.difficulty,
        estimatedTime: metadata?.estimatedTime,
        goals: metadata?.goals,
        license: metadata?.license,
        requiredFeatures: metadata?.requiredFeatures,
        version: metadata?.version,
      },
    );

    this.logger.debug('Template created', { templateId });

    return toTemplateDocument({ ...template, metadata: savedMetadata });
  }

  /**
   * Find all templates
   */
  async findAll(
    organization?: string,
    filters?: {
      purpose?: 'content' | 'prompt';
      key?: string;
      category?: string;
      categories?: string[];
      industries?: string[];
      platforms?: string[];
      scope?: string;
      isFeatured?: boolean;
      search?: string;
      sort?: 'popular';
      limit?: number;
    },
  ): Promise<Template[]> {
    const where: Prisma.TemplateWhereInput = { isDeleted: false };

    if (organization != null) {
      where.organizationId = organization;
    }

    if (filters?.purpose) where.purpose = filters.purpose;
    if (filters?.key) where.key = filters.key;
    if (filters?.category) where.category = filters.category;
    if (filters?.scope) where.scope = filters.scope;
    if (filters?.isFeatured !== undefined)
      where.isFeatured = filters.isFeatured;
    if (filters?.categories?.length) {
      where.categories = { hasSome: filters.categories };
    }
    if (filters?.industries?.length) {
      where.industries = { hasSome: filters.industries };
    }
    if (filters?.platforms?.length) {
      where.platforms = { hasSome: filters.platforms };
    }
    if (filters?.search) {
      where.OR = [
        { label: { contains: filters.search, mode: 'insensitive' } },
        {
          config: {
            path: ['description'],
            string_contains: filters.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const results = await this.prisma.template.findMany({
      include: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take:
        filters?.sort === 'popular' ? (filters.limit ?? 10) : filters?.limit,
      where,
    });

    const templates = results.map(toTemplateDocument);

    if (filters?.sort === 'popular') {
      return this.sortByPopularityScore(templates);
    }

    return templates;
  }

  /**
   * Private: Sort templates by popularity score (rating + usage weighted)
   * Shared ranking used by findAll({ sort: 'popular' })
   */
  private sortByPopularityScore(templates: Template[]): Template[] {
    return [...templates].sort((left, right) => {
      const leftScore = (left.rating ?? 0) * 0.3 + (left.usageCount ?? 0) * 0.7;
      const rightScore =
        (right.rating ?? 0) * 0.3 + (right.usageCount ?? 0) * 0.7;
      return rightScore - leftScore;
    });
  }

  /**
   * Find one template
   */
  async findOne(id: string, organization?: string): Promise<Template> {
    const where: Record<string, unknown> = { id, isDeleted: false };
    if (organization) {
      where.organizationId = organization;
    }

    const template = await findOrThrow(
      this.prisma.template,
      {
        include: { metadata: true },
        where: where as Prisma.TemplateWhereInput,
      },
      'Template',
      id,
    );

    return toTemplateDocument(template);
  }

  /**
   * Update template
   */
  async update(
    id: string,
    dto: UpdateTemplateDto,
    organization?: string,
  ): Promise<Template> {
    const where: Record<string, unknown> = { id, isDeleted: false };
    if (organization) {
      where.organizationId = organization;
    }

    const existing = await findOrThrow(
      this.prisma.template,
      { where: where as Prisma.TemplateWhereInput },
      'Template',
      id,
    );

    const { content, description, tags, metadata, variables, ...scalars } = dto;
    const hasConfigUpdate =
      content !== undefined || description !== undefined || tags !== undefined;
    const result = await this.prisma.template.update({
      data: {
        ...scalars,
        ...(variables !== undefined
          ? { variables: variables as Prisma.InputJsonValue }
          : {}),
        ...(hasConfigUpdate
          ? {
              config: {
                ...templateConfig(existing.config),
                ...(content !== undefined ? { content } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(tags !== undefined ? { tags } : {}),
              },
            }
          : {}),
      },
      where: { id },
    });
    if (metadata !== undefined) {
      const savedMetadata = await this.templateMetadataService.update(id, {
        ...metadata,
      });
      return toTemplateDocument({ ...result, metadata: savedMetadata });
    }
    return toTemplateDocument(result);
  }

  /**
   * Delete template (soft delete)
   */
  async remove(id: string, organization?: string): Promise<void> {
    const where: Record<string, unknown> = { id, isDeleted: false };
    if (organization) {
      where.organizationId = organization;
    }

    await findOrThrow(
      this.prisma.template,
      { where: where as Prisma.TemplateWhereInput },
      'Template',
      id,
    );

    await this.prisma.template.update({
      data: { isDeleted: true },
      where: { id },
    });
  }

  /**
   * Use template - fill in variables and generate content
   */
  async useTemplate(
    dto: UseTemplateDto,
    organization: string,
    userId?: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    generatedContent: string;
    template: Template;
  }> {
    try {
      this.logger.debug('Using template', {
        organization,
        templateId: dto.templateId,
      });

      // Get template
      const template = await this.findOne(dto.templateId, organization);

      // Fill in variables
      let generatedContent = this.fillVariables(
        template.content ?? '',
        dto.variables,
      );

      // Apply AI tweaks if requested
      if (dto.additionalInstructions) {
        generatedContent = await this.applyAITweaks(
          generatedContent,
          dto.additionalInstructions,
          onBilling,
        );
      }

      // Track usage
      await this.trackUsage(
        dto.templateId,
        organization,
        generatedContent,
        dto.variables,
        userId,
      );

      // Increment usage count
      await this.prisma.template.update({
        data: { usageCount: { increment: 1 } },
        where: { id: dto.templateId },
      });

      return {
        generatedContent,
        template,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to use template', { error });
      throw error;
    }
  }

  /**
   * Suggest templates based on criteria
   */
  async suggestTemplates(
    dto: SuggestTemplatesDto,
    organization: string,
    onBilling?: (amount: number) => void,
  ): Promise<
    Array<{
      template: Template;
      score: number;
      reasons: string[];
    }>
  > {
    try {
      this.logger.debug('Suggesting templates', {
        category: dto.category,
        goal: dto.goal,
        organization,
      });

      // Get all templates matching basic criteria
      const templates = await this.findAll(organization, {
        category: dto.category,
        industries: dto.industry ? [dto.industry] : undefined,
        platforms: dto.platform ? [dto.platform] : undefined,
      });

      if (templates.length === 0) {
        return [];
      }

      // Use AI to rank and suggest templates
      const suggestions = await this.rankTemplatesWithAI(
        templates,
        dto.goal,
        dto.keywords,
        onBilling,
      );

      const limit = dto.limit || 5;
      return suggestions.slice(0, limit);
    } catch (error: unknown) {
      this.logger.error('Failed to suggest templates', { error });
      throw error;
    }
  }

  /**
   * Get prompt template by key
   * Returns null if template not found (expected behavior for fallback logic)
   */
  async getPromptByKey(
    key: string,
    organization?: string,
  ): Promise<TemplateDocument | null> {
    // First, check for org-specific override
    if (organization) {
      const orgPrompt = await this.prisma.template.findFirst({
        include: { metadata: true },
        where: scopedWhere(organization, {
          isActive: true,
          key,
          purpose: 'prompt',
        }),
      });

      if (orgPrompt) {
        return toTemplateDocument(orgPrompt);
      }
    }

    // Fall back to global prompt (returns null if not found)
    const globalPrompt = await this.prisma.template.findFirst({
      include: { metadata: true },
      where: {
        isActive: true,
        isDeleted: false,
        key,
        organizationId: null,
        purpose: 'prompt',
      },
    });

    return globalPrompt ? toTemplateDocument(globalPrompt) : null;
  }

  /**
   * Render prompt template with variables using Handlebars
   */
  renderPrompt(template: string, variables: Record<string, unknown>): string {
    try {
      // Compile the template with Handlebars
      const compiledTemplate = Handlebars.compile(template);

      // Render with variables
      let rendered = compiledTemplate(variables);

      // Clean up multiple consecutive newlines (3+ newlines -> 2 newlines)
      rendered = rendered.replace(/\n{3,}/g, '\n\n');

      // Trim any leading/trailing whitespace
      rendered = rendered.trim();

      return rendered;
    } catch (error: unknown) {
      this.logger.error('renderPrompt failed', {
        error,
        template,
        variables,
      });
      // Fallback to original template if rendering fails
      return template;
    }
  }

  /**
   * Get and render prompt in one call
   */
  async getRenderedPrompt(
    key: string,
    variables: Record<string, unknown>,
    organization?: string,
  ): Promise<string> {
    const promptDoc = await this.getPromptByKey(key, organization);
    if (!promptDoc || typeof promptDoc.content !== 'string') {
      throw new NotFoundException('Template', key);
    }
    return this.renderPrompt(promptDoc.content, variables);
  }

  /**
   * Update prompt metadata (success rate, usage count)
   */
  async updateMetadata(
    key: string,
    updates: {
      incrementUsage?: boolean;
      successRate?: number;
      averageQuality?: number;
    },
  ): Promise<void> {
    try {
      await this.templateMetadataService.updateByTemplateKey(key, updates);
    } catch (error: unknown) {
      this.logger.error('updateMetadata failed', {
        error,
        key,
      });
      // Don't throw - metadata update failure shouldn't break the flow
    }
  }

  /**
   * Private: Extract variables from template content
   */
  private extractVariables(content: string): Array<{
    name: string;
    label: string;
    description: string;
    type: 'text';
    required: boolean;
  }> {
    const regex = templateVariablePattern();
    const variables: Set<string> = new Set();
    let match: RegExpExecArray | null = regex.exec(content);

    while (match !== null) {
      variables.add(match[1]);
      match = regex.exec(content);
    }

    return Array.from(variables).map((name) => ({
      description: `Value for ${this.formatLabel(name)}`,
      label: this.formatLabel(name),
      name,
      required: true,
      type: 'text',
    }));
  }

  /**
   * Private: Format variable name to label
   */
  private formatLabel(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Private: Fill variables in template
   */
  private fillVariables(
    content: string,
    variables: Record<string, string>,
  ): string {
    // Walk the placeholders that are actually in the template instead of
    // building one pattern per supplied key. Variable names come from the
    // request body, so interpolating them into a RegExp would let a caller
    // choose the pattern the server then runs over the template.
    //
    // The function form of `replace` also stops `$&`/`$1`/`$'` inside a
    // variable *value* from being re-read as replacement directives.
    //
    // A Map keeps the lookup off the prototype chain, so `{{constructor}}` and
    // `{{__proto__}}` resolve to nothing instead of to an inherited member.
    const supplied = new Map(Object.entries(variables));

    return content.replace(
      templateVariablePattern(),
      (placeholder: string, name: string) =>
        supplied.has(name) ? String(supplied.get(name) ?? '') : placeholder,
    );
  }

  /**
   * Private: Apply AI tweaks to generated content
   */
  private async applyAITweaks(
    content: string,
    instructions: string,
    onBilling?: (amount: number) => void,
  ): Promise<string> {
    const prompt = `Modify this content based on these instructions:

Content: "${content}"

Instructions: "${instructions}"

Return the modified content only, no explanation.`;

    const input = {
      max_completion_tokens: 2048,
      prompt,
    };
    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, result));

    return result || content;
  }

  /**
   * Private: Rank templates with AI
   */
  private async rankTemplatesWithAI(
    templates: Template[],
    goal?: string,
    keywords?: string[],
    onBilling?: (amount: number) => void,
  ): Promise<
    Array<{
      template: Template;
      score: number;
      reasons: string[];
    }>
  > {
    const goalText = goal ? ` to achieve: "${goal}"` : '';
    const keywordsText = keywords?.length
      ? ` Keywords: ${keywords.join(', ')}`
      : '';

    const templateList = templates
      .map((t, i) => `${i + 1}. ${t.label}: ${t.description}`)
      .join('\n');

    const prompt = `Rank these templates${goalText}.${keywordsText}

Templates:
${templateList}

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "rankings": [
    {
      "index": 0,
      "score": 95,
      "reasons": ["Perfect for viral content", "Proven track record"]
    }
  ]
}

Score 0-100. Include top 5 only.`;

    try {
      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<{
        rankings: Array<{ index: number; score: number; reasons: string[] }>;
      }>(response, { rankings: [] });

      const rankings = result.rankings;

      return rankings.map(
        (r: { index: number; score: number; reasons: string[] }) => ({
          reasons: r.reasons,
          score: r.score,
          template: templates[r.index],
        }),
      );
    } catch (error: unknown) {
      this.logger.error('AI ranking failed, using fallback', { error });

      // Fallback: sort by usage and rating
      return templates
        .sort((a, b) => {
          const scoreA = (a.usageCount ?? 0) * 0.7 + (a.rating ?? 0) * 0.3;
          const scoreB = (b.usageCount ?? 0) * 0.7 + (b.rating ?? 0) * 0.3;
          return scoreB - scoreA;
        })
        .slice(0, 5)
        .map((template) => ({
          reasons: ['Popular template', 'High usage count'],
          score: 75,
          template,
        }));
    }
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }

  /**
   * Private: Track template usage
   */
  private async trackUsage(
    templateId: string,
    organization: string,
    generatedContent: string,
    variables: Record<string, string>,
    userId?: string,
  ): Promise<void> {
    await this.templateUsageService.create({
      generatedContent,
      organization,
      template: templateId,
      user: userId,
      variables,
    });

    // Update metadata usage count
    await this.templateMetadataService.update(templateId, {
      lastUsed: new Date(),
      usageCount: await this.templateUsageService.countByTemplate(templateId),
    });
  }
}
