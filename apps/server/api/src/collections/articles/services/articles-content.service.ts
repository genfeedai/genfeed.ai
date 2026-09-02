/**
 * Articles Content Service
 * Handles AI-powered content generation:
 * - Generate articles from prompts using AI
 * - Convert articles to Twitter threads
 * - Poll generation status
 * - Handle content generation failures
 *
 * This service encapsulates all AI-related content operations
 * to keep the main ArticlesService focused on CRUD operations.
 */

import { TwitterThreadResponse } from '@api/collections/articles/dto/article-to-thread.dto';
import {
  ArticleGenerationType,
  type GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { type ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import type {
  ArticleCreateFn,
  ArticleCycleModelConfig,
  ArticleExistingReviewContext,
  ArticleGenerationContext,
  ArticleGenerationDraft,
  ArticleGenerationReviewState,
  ArticleGenerationRevisionState,
  ArticleGenerationWorkItem,
  ArticleHarnessContext,
  ArticleReviewRubric,
  ParsedXArticleDrafts,
  XArticleContentMetadata,
} from '@api/collections/articles/services/articles-content.types';
import { buildTwitterThreadTweets } from '@api/collections/articles/utils/article-thread.util';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { scopedWhere } from '@api/index';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  buildPromptBuilderBrandContext,
} from '@api/services/harness/harness-brief.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  ArticleCategory,
  ArticleStatus,
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { AccountPublishingContext } from '@genfeedai/interfaces';
import type {
  ArticleGenerationResponse,
  GeneratedArticleData,
} from '@genfeedai/interfaces/content/article.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export type {
  ArticleCycleModelConfig,
  ArticleExistingReviewContext,
  ArticleGenerationContext,
  ArticleGenerationReviewState,
  ArticleGenerationRevisionState,
  ArticleGenerationWorkItem,
  ArticleReviewRubric,
} from '@api/collections/articles/services/articles-content.types';

type HarnessPersonaInput = Parameters<typeof buildHarnessInput>[0]['persona'];

@Injectable()
export class ArticlesContentService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultArticleLabel = 'Untitled Article';

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly articleTextGenerationService: ArticleTextGenerationService,
    private readonly articleReviewService: ArticleReviewService,
    private readonly articleContentPersistenceService: ArticleContentPersistenceService,

    @Optional() private readonly templatesService?: TemplatesService,
    @Optional() private readonly brandsService?: BrandsService,
    @Optional() private readonly personasService?: PersonasService,
    @Optional() private readonly contentHarnessService?: ContentHarnessService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
    @Optional()
    private readonly accountPublishingContextService?: AccountPublishingContextService,
    @Optional() private readonly replicateService?: ReplicateService,
  ) {}

  private appendAccountPublishingContextToPrompt(
    prompt: string,
    context?: AccountPublishingContext,
  ): string {
    if (!context) {
      return prompt;
    }

    return [
      prompt,
      '',
      'Account publishing context:',
      ...context.promptHints.map((hint) => `- ${hint}`),
      ...context.constraints.notes.map((note) => `- ${note}`),
      '',
      'Write this as a copy-ready X Article for the selected account. Do not mention that Genfeed cannot publish it.',
    ].join('\n');
  }

  private async resolveArticleAccountPublishingContext(params: {
    brandId: string;
    credentialId?: string;
    organizationId: string;
    type?: ArticleGenerationType;
  }): Promise<AccountPublishingContext | undefined> {
    if (
      params.type !== ArticleGenerationType.X_ARTICLE ||
      !params.credentialId ||
      !this.accountPublishingContextService
    ) {
      return undefined;
    }

    return this.accountPublishingContextService.resolve({
      brandId: params.brandId,
      credentialId: params.credentialId,
      organizationId: params.organizationId,
      surface: 'x-article',
    });
  }

  async prepareGeneration(
    generateDto: GenerateArticlesDto,
    userId: string,
    organizationId: string,
    brandId: string,
    modelConfig: ArticleCycleModelConfig,
  ): Promise<ArticleGenerationContext> {
    this.assertGenerationReady();
    const generationType = generateDto.type || ArticleGenerationType.STANDARD;
    const isXArticle = generationType === ArticleGenerationType.X_ARTICLE;
    const accountPublishingContext = isXArticle
      ? await this.resolveArticleAccountPublishingContext({
          brandId,
          credentialId: generateDto.credential,
          organizationId,
          type: generationType,
        })
      : undefined;
    const templateKey = isXArticle
      ? PromptTemplateKey.X_ARTICLE_GENERATE
      : PromptTemplateKey.ARTICLE_GENERATE;
    const prompt = await this.renderGenerationPrompt(
      templateKey,
      isXArticle
        ? {
            keywords: generateDto.keywords?.join(', ') || '',
            prompt: generateDto.prompt,
            targetWordCount: generateDto.targetWordCount || 5000,
            tone: generateDto.tone || 'authoritative',
          }
        : {
            category: generateDto.category || '',
            count: generateDto.count || 1,
            keywords: generateDto.keywords?.join(', ') || '',
            prompt: generateDto.prompt,
          },
      organizationId,
    );
    const harnessContext = await this.buildArticleHarnessContext({
      brandId,
      contentType: 'article',
      objective: 'authority',
      organizationId,
      sourceLines: [
        ...(accountPublishingContext?.promptHints ?? []),
        ...(generateDto.keywords?.map((keyword) => `keyword: ${keyword}`) ??
          []),
        ...(generateDto.tone ? [`tone: ${generateDto.tone}`] : []),
        ...(isXArticle
          ? [`targetWordCount: ${generateDto.targetWordCount || 5000}`]
          : []),
      ],
      topic: generateDto.prompt,
    });
    return {
      brandId,
      category: isXArticle
        ? ArticleCategory.X_ARTICLE
        : generateDto.category || ArticleCategory.POST,
      generateDto,
      generationType,
      harnessContext,
      maxCount: isXArticle ? 1 : generateDto.count || 1,
      modelConfig,
      organizationId,
      parseFailureLabel: isXArticle
        ? 'Failed to parse X Article generation JSON'
        : 'Failed to parse article generation JSON',
      prompt: this.appendAccountPublishingContextToPrompt(
        prompt,
        accountPublishingContext,
      ),
      systemPromptTemplate: isXArticle
        ? SystemPromptKey.X_ARTICLE
        : SystemPromptKey.ARTICLE,
      textPromptTemplate: isXArticle
        ? PromptTemplateKey.X_ARTICLE_GENERATE
        : PromptTemplateKey.TEXT_ARTICLE,
      userId,
    };
  }

  async generateDrafts(context: ArticleGenerationContext): Promise<{
    billedCredits: number;
    context: ArticleGenerationContext;
    items: ArticleGenerationWorkItem[];
  }> {
    let billedCredits = 0;
    const responseText =
      await this.articleTextGenerationService.runTextGenerationStep({
        basePrompt: context.prompt,
        buildPromptOptions: {
          maxTokens: this.configService.get('MAX_TOKENS'),
          modelCategory: ModelCategory.TEXT,
          promptTemplate: context.textPromptTemplate,
          systemPromptTemplate: context.systemPromptTemplate,
          temperature: 0.8,
        },
        failureMessage: 'Failed to generate content from AI service',
        harnessContext: context.harnessContext,
        model: context.modelConfig.generationModel || DEFAULT_TEXT_MODEL,
        onBilling: (charge) => {
          billedCredits += charge.amount;
        },
        organizationId: context.organizationId,
      });
    const response = this.parseArticleGenerationJson(
      responseText,
      context.parseFailureLabel,
    );
    const drafts =
      context.generationType === ArticleGenerationType.X_ARTICLE
        ? this.parseXArticleDrafts(response).drafts
        : this.normalizeStandardGenerationDrafts(response);
    return {
      billedCredits,
      context,
      items: drafts.slice(0, context.maxCount).map((draft) => ({
        context,
        draft,
      })),
    };
  }

  async reviewDraft(
    item: ArticleGenerationWorkItem,
  ): Promise<ArticleGenerationReviewState> {
    const result = await this.articleReviewService.reviewDraft({
      draft: item.draft,
      harnessContext: item.context.harnessContext,
      modelConfig: item.context.modelConfig,
      organizationId: item.context.organizationId,
      type: item.context.generationType,
    });
    return {
      ...item,
      billedCredits: result.charge.amount,
      review: result.review,
    };
  }

  async reviseDraft(
    state: ArticleGenerationReviewState,
  ): Promise<ArticleGenerationRevisionState> {
    const result = await this.articleReviewService.reviseDraft({
      draft: state.draft,
      harnessContext: state.context.harnessContext,
      modelConfig: state.context.modelConfig,
      organizationId: state.context.organizationId,
      prompt: state.context.generateDto.prompt,
      review: state.review,
      type: state.context.generationType,
    });
    return {
      ...state,
      billedCredits: state.billedCredits + result.charge.amount,
      updated: result.updated,
    };
  }

  async persistDraft(
    state: ArticleGenerationRevisionState,
    createArticleFn: ArticleCreateFn,
  ): Promise<{ article: ArticleDocument; billedCredits: number }> {
    const article =
      await this.articleContentPersistenceService.persistGeneratedArticle({
        brandId: state.context.brandId,
        category: state.context.category,
        createArticleFn,
        draft: state.updated,
        organizationId: state.context.organizationId,
        slug: state.draft.slug,
        tagLabels: state.draft.tags,
        userId: state.context.userId,
      });
    return { article, billedCredits: state.billedCredits };
  }

  private assertGenerationReady(): void {
    if (!this.replicateService) {
      throw new Error('OpenAI service not available');
    }

    if (!this.configService) {
      throw new Error('Config service not available');
    }
  }

  private async renderGenerationPrompt(
    templateKey: PromptTemplateKey,
    variables: Record<string, unknown>,
    organizationId: string,
  ): Promise<string> {
    const prompt = await this.templatesService?.getRenderedPrompt(
      templateKey,
      variables,
      organizationId,
    );

    if (!prompt) {
      throw new Error('Template service not available');
    }

    await this.templatesService?.updateMetadata(templateKey, {
      incrementUsage: true,
    });

    return prompt;
  }

  private parseArticleGenerationJson(
    responseText: string,
    parseFailureLabel: string,
  ): ArticleGenerationResponse {
    try {
      return JSON.parse(responseText) as ArticleGenerationResponse;
    } catch (parseError) {
      this.logger.error(parseFailureLabel, {
        parseError,
        responseText: responseText.substring(0, 500),
      });
      throw new Error('Invalid JSON response from AI service');
    }
  }

  private normalizeStandardGenerationDrafts(
    response: ArticleGenerationResponse,
  ): ArticleGenerationDraft[] {
    let generatedArticles: GeneratedArticleData[];
    if (response?.articles && Array.isArray(response.articles)) {
      generatedArticles = response.articles;
    } else if (response?.slug || response?.title || response?.label) {
      generatedArticles = [response as GeneratedArticleData];
    } else {
      throw new Error('Unexpected response format from AI service');
    }

    return generatedArticles.map((generated, index) => ({
      content: generated.content || '',
      label:
        generated.label || generated.title || `Generated Article ${index + 1}`,
      slug: generated.slug || `article-${Date.now()}-${index}`,
      summary: generated.summary || '',
      tags: generated.tags,
    }));
  }

  private parseXArticleDrafts(
    response: ArticleGenerationResponse,
  ): ParsedXArticleDrafts {
    if (
      !response?.title ||
      !response?.sections ||
      !Array.isArray(response.sections)
    ) {
      throw new Error('Unexpected response format from AI service');
    }

    // Sections are folded into `content`. Do not persist `xArticleMetadata` —
    // Article has no such column (#2859).
    const { content, wordCount } = this.buildXArticleContentAndMetadata(
      response.sections,
    );

    return {
      drafts: [
        {
          content,
          label: response.title,
          slug: response.slug || `x-article-${Date.now()}`,
          summary: response.summary || '',
          tags: response.tags,
        },
      ],
      wordCount,
    };
  }

  /**
   * Convert article to Twitter thread
   */
  convertToTwitterThread(
    article: ArticleDocument,
  ): Promise<TwitterThreadResponse> {
    try {
      this.logger.debug(`${this.constructorName} convertToTwitterThread`, {
        articleId: article.id,
      });

      // Resolve the article URL for the trailing link tweet. A tweet is a
      // public broadcast, so an unpublished article gets no link at all —
      // linking one would publish the draft (and any preview grant with it).
      let articleUrl: string | undefined;
      const publicUrl = (
        this.configService?.get('GENFEEDAI_PUBLIC_URL') as string | undefined
      )?.replace(/\/$/, '');
      if (
        article.slug &&
        publicUrl &&
        String(article.status) === ArticleStatus.PUBLISHED
      ) {
        articleUrl = `${publicUrl}/articles/${article.slug}`;
      }

      const tweets = buildTwitterThreadTweets({
        articleUrl,
        content: article.content ?? '',
        label: this.getArticleLabel(article),
        summary: article.summary ?? '',
      });

      this.logger.log(
        `${this.constructorName} converted article to ${tweets.length} tweets`,
        { articleId: article.id, totalTweets: tweets.length },
      );

      return Promise.resolve({
        totalTweets: tweets.length,
        tweets,
      } as TwitterThreadResponse);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} convertToTwitterThread failed`,
        {
          articleId: article.id,
          error,
        },
      );
      throw error;
    }
  }

  /**
   * Build the concatenated HTML body and reading metadata for an X Article from
   * its generated sections. Extracted from generateLongFormArticle.
   */
  private buildXArticleContentAndMetadata(
    sections: NonNullable<ArticleGenerationResponse['sections']>,
  ): XArticleContentMetadata {
    // Headings and pull quotes are plain-text fields; escape them before
    // wrapping in HTML so generated text can't inject markup. section.content
    // is intentionally HTML and passes through unescaped.
    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Build full HTML content by concatenating sections
    const htmlParts: string[] = [];
    for (const section of sections) {
      if (section.heading) {
        htmlParts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
      }
      if (section.content) {
        htmlParts.push(section.content);
      }
      if (section.pullQuote) {
        htmlParts.push(
          `<blockquote>${escapeHtml(section.pullQuote)}</blockquote>`,
        );
      }
    }
    const content = htmlParts.join('\n');

    // Calculate word count and estimated read time
    const plainText = content.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const estimatedReadTime = Math.ceil(wordCount / 250);

    return {
      content,
      metadata: {
        estimatedReadTime,
        sections: sections.map((section, index) => ({
          content: section.content || '',
          heading: section.heading || '',
          id: `section-${index + 1}`,
          order: index + 1,
          pullQuote: section.pullQuote,
        })),
        wordCount,
      },
      wordCount,
    };
  }

  private async buildArticleHarnessContext(params: {
    brandId?: string;
    contentType: 'article';
    objective: 'authority';
    organizationId: string;
    sourceLines?: string[];
    topic: string;
  }): Promise<ArticleHarnessContext> {
    if (
      !params.brandId ||
      !this.brandsService ||
      !this.contentHarnessService ||
      !this.personasService
    ) {
      return { promptBuilder: {} };
    }

    const brand = await this.brandsService.findOne(
      scopedWhere(params.organizationId, { id: params.brandId }),
      'none',
    );

    if (!brand) {
      return { promptBuilder: {} };
    }

    const persona = await this.personasService.findOne(
      scopedWhere(params.organizationId, { brandId: params.brandId }),
    );
    const harnessPersona = this.normalizeHarnessPersona(persona);
    const profileContribution =
      await this.harnessProfilesService?.buildContributionForBrand(
        params.organizationId,
        params.brandId,
      );

    const brief = await this.contentHarnessService.composeBrief(
      buildHarnessInput({
        additionalSources:
          params.sourceLines?.map((content, index) => ({
            content,
            id: `article-context-${index}`,
            kind: 'audience_signal',
          })) ?? [],
        brand,
        intent: {
          contentType: params.contentType,
          objective: params.objective,
          topic: params.topic,
        },
        organizationId: params.organizationId,
        persona: harnessPersona,
        profileContribution: profileContribution ?? undefined,
      }),
    );

    return {
      brief,
      promptBuilder: buildPromptBuilderBrandContext({
        brand,
        persona: harnessPersona,
      }),
    };
  }

  async prepareExistingReview(
    article: ArticleDocument,
    organizationId: string,
    modelConfig: ArticleCycleModelConfig,
    focus?: string,
  ): Promise<ArticleExistingReviewContext> {
    const harnessContext = await this.buildArticleHarnessContext({
      brandId: article.brandId ?? undefined,
      contentType: 'article',
      objective: 'authority',
      organizationId,
      sourceLines: focus ? [`review-focus: ${focus}`] : [],
      topic: this.getArticleLabel(article),
    });

    return {
      article,
      ...(focus === undefined ? {} : { focus }),
      harnessContext,
      modelConfig,
      organizationId,
    };
  }

  async reviewExistingPrepared(
    context: ArticleExistingReviewContext,
  ): Promise<{ billedCredits: number; review: ArticleReviewRubric }> {
    let billedCredits = 0;
    const review = await this.articleReviewService.reviewExistingArticle(
      context.article,
      context.organizationId,
      context.modelConfig,
      context.harnessContext,
      context.focus,
      (charge) => {
        billedCredits += charge.amount;
      },
    );
    return { billedCredits, review };
  }

  private getArticleLabel(article: Pick<ArticleDocument, 'label'>): string {
    const label = article.label?.trim();

    return label ? label : this.defaultArticleLabel;
  }

  private normalizeHarnessPersona(
    persona: PersonaDocument | null | undefined,
  ): HarnessPersonaInput {
    if (!persona) {
      return null;
    }

    const personaRecord = persona as Record<string, unknown>;
    const normalizedPersona: NonNullable<HarnessPersonaInput> = {
      bio:
        typeof personaRecord.bio === 'string' ? personaRecord.bio : undefined,
      contentStrategy:
        personaRecord.contentStrategy as NonNullable<HarnessPersonaInput>['contentStrategy'],
      fleetSources: Array.isArray(personaRecord.fleetSources)
        ? (personaRecord.fleetSources as NonNullable<HarnessPersonaInput>['fleetSources'])
        : undefined,
      handle:
        typeof personaRecord.handle === 'string'
          ? personaRecord.handle
          : undefined,
      label: persona.label,
    };

    return normalizedPersona;
  }
}
