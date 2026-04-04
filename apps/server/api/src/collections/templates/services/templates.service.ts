import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';
import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';
import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';
import {
  Template,
  type TemplateDocument,
} from '@api/collections/templates/schemas/template.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Handlebars from 'handlebars';
import { Model, Types } from 'mongoose';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name, DB_CONNECTIONS.CLOUD)
    private templateModel: Model<TemplateDocument>,
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
    // Helper to check if any of the provided values are truthy
    // Usage: {{#ifAny mood camera}}...{{/ifAny}}
    // Handlebars passes the resolved VALUES of mood and camera, not their names
    Handlebars.registerHelper('ifAny', function (...args: unknown[]) {
      const options = args[args.length - 1] as Handlebars.HelperOptions;
      const values = args.slice(0, -1); // All args except the last are resolved values

      // Check if any of the values are truthy
      for (const value of values) {
        if (value) {
          // @ts-expect-error TS2683
          return options.fn(this);
        }
      }

      // @ts-expect-error TS2683
      return options.inverse(this);
    });
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
      const existing = await this.templateModel.findOne({
        isDeleted: false,
        key: dto.key,
        purpose: 'prompt',
      });
      if (existing) {
        throw new Error(`Template with key "${dto.key}" already exists`);
      }
    }

    const template = new this.templateModel({
      ...dto,
      createdBy: userId,
      isActive: dto.isActive ?? (dto.purpose === 'prompt' ? true : undefined),
      organization: organization || null,
      variables,
      version: dto.version ?? (dto.purpose === 'prompt' ? 1 : undefined),
    });

    await template.save();

    const metadata = await this.templateMetadataService.create(
      (template._id as Types.ObjectId).toString(),
      {
        author: dto.metadata?.author,
        compatiblePlatforms: dto.metadata?.compatiblePlatforms,
        difficulty: dto.metadata?.difficulty,
        estimatedTime: dto.metadata?.estimatedTime,
        goals: dto.metadata?.goals,
        license: dto.metadata?.license,
        requiredFeatures: dto.metadata?.requiredFeatures,
        version: dto.metadata?.version,
      },
    );

    // @ts-expect-error TS2322
    template.metadata = metadata._id.toString();
    await template.save();

    this.logger.debug('Template created', { templateId: template._id });

    return template.toObject();
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
    },
  ): Promise<Template[]> {
    const queryBuilder = new QueryBuilder(organization);

    queryBuilder
      .addFilter('purpose', filters?.purpose)
      .addFilter('key', filters?.key)
      .addFilter('category', filters?.category)
      .addInFilter('categories', filters?.categories)
      .addInFilter('industries', filters?.industries)
      .addInFilter('platforms', filters?.platforms)
      .addFilter('scope', filters?.scope)
      .addBooleanFilter('isFeatured', filters?.isFeatured)
      .addTextSearch(filters?.search);

    const query = queryBuilder.build();

    return await this.templateModel
      .find(query)
      .populate('metadata')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Find one template
   */
  async findOne(id: string, organization?: string): Promise<Template> {
    const queryBuilder = new QueryBuilder(organization);
    queryBuilder.addFilter('_id', id);

    const template = await this.templateModel
      .findOne(queryBuilder.build())
      .populate('metadata')
      .lean();

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Update template
   */
  async update(
    id: string,
    dto: UpdateTemplateDto,
    organization?: string,
  ): Promise<Template> {
    const query: Record<string, unknown> = { _id: id, isDeleted: false };
    if (organization) {
      query.organization = organization;
    }

    const template = await this.templateModel.findOneAndUpdate(
      query,
      { $set: dto },
      { returnDocument: 'after' },
    );

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template.toObject();
  }

  /**
   * Delete template (soft delete)
   */
  async remove(id: string, organization?: string): Promise<void> {
    const query: Record<string, unknown> = { _id: id, isDeleted: false };
    if (organization) {
      query.organization = organization;
    }

    const result = await this.templateModel.updateOne(query, {
      $set: { isDeleted: true },
    });

    if (result.matchedCount === 0) {
      throw new NotFoundException('Template not found');
    }
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
        template.content,
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
      await this.templateModel.updateOne(
        { _id: dto.templateId },
        { $inc: { usageCount: 1 } },
      );

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
   * Get popular templates
   */
  async getPopularTemplates(
    organization?: string,
    limit: number = 10,
  ): Promise<Template[]> {
    const query: Record<string, unknown> = { isDeleted: false };
    if (organization) {
      query.organization = organization;
    }
    return await this.templateModel
      .find(query)
      .populate('metadata')
      .sort({ rating: -1, usageCount: -1 })
      .limit(limit)
      .lean();
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
      const orgPrompt = await this.templateModel
        .findOne({
          isActive: true,
          isDeleted: false,
          key,
          organization: new Types.ObjectId(organization) as unknown as string,
          purpose: 'prompt',
        })
        .populate('metadata')
        .exec();

      if (orgPrompt) {
        return orgPrompt;
      }
    }

    // Fall back to global prompt (returns null if not found)
    return this.templateModel
      .findOne({
        isActive: true,
        isDeleted: false,
        key,
        organization: null,
        purpose: 'prompt',
      })
      .populate('metadata')
      .exec();
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
      // This handles cases where {{#if}} blocks leave behind extra blank lines
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
    // @ts-expect-error TS18047
    return this.renderPrompt(promptDoc.content, variables);
  }

  /**
   * Update prompt metadata (success rate, usage count)
   * Now updates TemplateMetadata collection
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
    const regex = /\{\{(\w+)\}\}/g;
    const variables: Set<string> = new Set();
    let match;

    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
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
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Private: Apply AI tweaks to generated content using Replicate GPT-5.2
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
          const scoreA = a.usageCount * 0.7 + a.rating * 0.3;
          const scoreB = b.usageCount * 0.7 + b.rating * 0.3;
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
      isDeleted: false,
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
