import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  type ContentDraft,
  type SkillExecutionContext,
  type SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildHowToJsonLd,
  type JsonLdValue,
} from '@helpers/content/schema-org.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const GEO_SKILL_SLUG = 'content-geo-optimizer';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const TRUSTED_GEO_MODELS = new Set([
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'x-ai/grok-4-fast',
]);

interface GeoDimensionScore {
  finding: string;
  id: string;
  label: string;
  max: number;
  score: number;
}

interface GeoScorecard {
  dimensions: GeoDimensionScore[];
  evidence: string[];
  rating: 'excellent' | 'good' | 'needs_work' | 'poor';
  schemaTypes: string[];
  score: number;
  suggestions: string[];
}

interface GeoLlmResult {
  rewrittenContent?: string;
  suggestions?: string[];
}

interface FaqParam {
  answer: string;
  question: string;
}

interface HowToStepParam {
  name?: string;
  text: string;
}

@Injectable()
export class ContentGeoOptimizerHandler implements SkillHandler {
  constructor(
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly loggerService: LoggerService,
  ) {}

  async execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<ContentDraft> {
    const sourceContent = this.resolveContent(params);
    if (!sourceContent) {
      throw new Error(`${GEO_SKILL_SLUG} requires content`);
    }

    const title = this.getString(params.title) ?? 'Generated content';
    const sources = this.getStringArray(params.sources);
    const questions = this.getFaqParams(params.questions ?? params.faq);
    const steps = this.getHowToSteps(params.steps);
    const scorecard = this.buildGeoScorecard(sourceContent, {
      questions,
      sources,
      steps,
      title,
    });

    const fallbackContent = this.buildFallbackRewrite(
      sourceContent,
      title,
      sources,
    );
    const llmResult = await this.runLlmRewrite(
      context,
      params,
      sourceContent,
      scorecard,
    );
    const rewrittenContent =
      llmResult?.rewrittenContent?.trim() || fallbackContent;
    const jsonLd = this.buildJsonLd(params, {
      content: rewrittenContent,
      questions,
      steps,
      title,
    });

    const suggestions = this.dedupe([
      ...(llmResult?.suggestions ?? []),
      ...scorecard.suggestions,
    ]).slice(0, 8);

    return {
      confidence: scorecard.score >= 75 ? 0.84 : 0.68,
      content: rewrittenContent,
      metadata: {
        geoScorecard: {
          ...scorecard,
          suggestions,
        },
        jsonLd,
        llmApplied: Boolean(llmResult?.rewrittenContent),
        schemaType: jsonLd['@type'],
        sources,
      },
      platforms: context.platforms,
      skillSlug: GEO_SKILL_SLUG,
      type: 'text',
    };
  }

  private async runLlmRewrite(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
    sourceContent: string,
    scorecard: GeoScorecard,
  ): Promise<GeoLlmResult | null> {
    try {
      const response = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 1400,
          messages: [
            {
              content:
                'You optimize long-form content for generative answer engines. Return only JSON.',
              role: 'system',
            },
            {
              content: this.buildLlmPrompt(context, sourceContent, scorecard),
              role: 'user',
            },
          ],
          model: this.resolveModel(params.model),
          temperature: 0.3,
        },
        context.organizationId,
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as GeoLlmResult;
      return {
        rewrittenContent: this.getString(parsed.rewrittenContent),
        suggestions: this.getStringArray(parsed.suggestions),
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `${GEO_SKILL_SLUG} LLM call failed, using fallback`,
        {
          error,
        },
      );
      return null;
    }
  }

  private buildLlmPrompt(
    context: SkillExecutionContext,
    sourceContent: string,
    scorecard: GeoScorecard,
  ): string {
    const weakFindings = scorecard.dimensions
      .filter((dimension) => dimension.score < dimension.max)
      .map((dimension) => `- ${dimension.label}: ${dimension.finding}`)
      .join('\n');

    return [
      'Rewrite the content so ChatGPT, Perplexity, Claude, Google AI Overviews, and other answer engines can extract and cite it.',
      'Return this exact JSON shape: {"rewrittenContent":"...","suggestions":["..."]}',
      'Rules:',
      '- Start with a direct answer block.',
      '- Use question-led headings where natural.',
      '- Preserve factual meaning and brand voice.',
      '- Add source/citation placeholders only when the input provides source URLs.',
      '- Do not invent facts, statistics, sources, dates, or quotes.',
      `Brand voice: ${context.brandVoice || 'clear, useful, and evidence-led'}.`,
      weakFindings ? `Weak GEO findings:\n${weakFindings}` : null,
      `Content:\n${sourceContent.slice(0, 12000)}`,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n\n');
  }

  private buildGeoScorecard(
    content: string,
    options: {
      questions: FaqParam[];
      sources: string[];
      steps: HowToStepParam[];
      title: string;
    },
  ): GeoScorecard {
    const plainText = this.stripHtml(content);
    const questionHeadingCount = (
      content.match(
        /(?:^|\n)\s*#{2,3}\s+(?:what|how|why|when|where|who|can|should|does|is|are)\b/gi,
      ) ?? []
    ).length;
    const linkCount = (content.match(/https?:\/\//gi) ?? []).length;
    const hasJsonLd = /application\/ld\+json|schema\.org/i.test(content);
    const hasFreshness =
      /\b(?:20\d{2}|updated|last modified|published)\b/i.test(content);
    const sentences = plainText.split(/(?<=[.!?])\s+/).filter(Boolean);
    const conciseSentences = sentences.filter((sentence) => {
      const words = sentence.split(/\s+/).filter(Boolean).length;
      return words >= 8 && words <= 35;
    }).length;
    const conciseRatio =
      sentences.length > 0 ? conciseSentences / sentences.length : 0;
    const titleTerms = options.title
      .split(/\s+/)
      .filter((term) => /^[A-Z][a-z0-9-]+/.test(term));

    const dimensions: GeoDimensionScore[] = [
      {
        finding:
          questionHeadingCount > 0
            ? 'Question-led headings are present.'
            : 'Add question-led H2/H3 headings that match answer-engine prompts.',
        id: 'question_led_headings',
        label: 'Question-led headings',
        max: 18,
        score:
          questionHeadingCount >= 2 ? 18 : questionHeadingCount === 1 ? 12 : 4,
      },
      {
        finding:
          conciseRatio >= 0.6
            ? 'Most sentences are extractable answer-length statements.'
            : 'Use more concise answer blocks that can be quoted independently.',
        id: 'extractable_answers',
        label: 'Extractable answer blocks',
        max: 20,
        score: Math.round(Math.min(1, conciseRatio) * 20),
      },
      {
        finding:
          options.sources.length + linkCount >= 2
            ? 'Source signals are available for attribution.'
            : 'Add source URLs or citations for factual claims.',
        id: 'source_attribution',
        label: 'Source attribution',
        max: 17,
        score:
          options.sources.length + linkCount >= 3
            ? 17
            : options.sources.length + linkCount >= 1
              ? 10
              : 2,
      },
      {
        finding:
          titleTerms.length > 0
            ? 'Named entities are identifiable from title and copy.'
            : 'Name the product, brand, entities, and topic explicitly.',
        id: 'entity_clarity',
        label: 'Entity clarity',
        max: 15,
        score: titleTerms.length >= 2 ? 15 : titleTerms.length === 1 ? 11 : 5,
      },
      {
        finding:
          hasJsonLd || options.questions.length > 0 || options.steps.length > 0
            ? 'Structured-data candidates are present.'
            : 'Add Article, FAQ, or HowTo JSON-LD for the generated content.',
        id: 'schema_readiness',
        label: 'Schema readiness',
        max: 15,
        score:
          hasJsonLd || options.questions.length > 0 || options.steps.length > 0
            ? 15
            : 6,
      },
      {
        finding: hasFreshness
          ? 'Freshness signals are visible.'
          : 'Add a published, updated, or current-year context signal.',
        id: 'freshness',
        label: 'Freshness signals',
        max: 15,
        score: hasFreshness ? 15 : 5,
      },
    ];

    const score = dimensions.reduce(
      (total, dimension) => total + dimension.score,
      0,
    );
    return {
      dimensions,
      evidence: [
        `${sentences.length} sentences inspected`,
        `${questionHeadingCount} question-led headings`,
        `${options.sources.length + linkCount} source signals`,
      ],
      rating:
        score >= 85
          ? 'excellent'
          : score >= 70
            ? 'good'
            : score >= 45
              ? 'needs_work'
              : 'poor',
      schemaTypes: this.resolveSchemaTypes(options.questions, options.steps),
      score,
      suggestions: dimensions
        .filter((dimension) => dimension.score < dimension.max)
        .map((dimension) => dimension.finding),
    };
  }

  private buildFallbackRewrite(
    sourceContent: string,
    title: string,
    sources: string[],
  ): string {
    const plainText = this.stripHtml(sourceContent);
    const directAnswer =
      this.firstSentence(plainText) || plainText.slice(0, 220);
    const sourceSection =
      sources.length > 0
        ? ['## Sources', ...sources.map((source) => `- ${source}`)].join('\n')
        : '';

    return [
      `## Direct answer: ${title}`,
      directAnswer,
      '## Citation-ready explanation',
      sourceContent.trim(),
      sourceSection,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildJsonLd(
    params: Record<string, unknown>,
    input: {
      content: string;
      questions: FaqParam[];
      steps: HowToStepParam[];
      title: string;
    },
  ): Record<string, JsonLdValue> {
    const url = this.getString(params.url);
    const description =
      this.getString(params.description) ??
      this.firstSentence(this.stripHtml(input.content));

    if (input.steps.length > 0) {
      return buildHowToJsonLd({
        description,
        name: input.title,
        steps: input.steps,
        url,
      });
    }

    if (input.questions.length > 0) {
      return buildFaqJsonLd({
        items: input.questions,
        name: input.title,
        url,
      });
    }

    return buildArticleJsonLd({
      author: this.getString(params.authorName),
      body: input.content,
      dateModified: this.getString(params.dateModified),
      datePublished: this.getString(params.datePublished),
      description,
      headline: input.title,
      keywords: this.getStringArray(params.keywords),
      mainEntityUrl: url,
      publisher: this.getString(params.publisherName),
      url,
      wordCount: this.stripHtml(input.content).split(/\s+/).filter(Boolean)
        .length,
    });
  }

  private resolveSchemaTypes(
    questions: FaqParam[],
    steps: HowToStepParam[],
  ): string[] {
    if (steps.length > 0) {
      return ['HowTo'];
    }

    if (questions.length > 0) {
      return ['FAQPage'];
    }

    return ['Article'];
  }

  private resolveContent(params: Record<string, unknown>): string {
    return (
      this.getString(params.content) ??
      this.getString(params.text) ??
      this.getString(params.articleBody) ??
      ''
    );
  }

  private resolveModel(value: unknown): string {
    if (typeof value === 'string' && TRUSTED_GEO_MODELS.has(value.trim())) {
      return value.trim();
    }

    return DEFAULT_MODEL;
  }

  private getFaqParams(value: unknown): FaqParam[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item): FaqParam | null => {
        if (typeof item === 'string') {
          return { answer: '', question: item.trim() };
        }

        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const question = this.getString(record.question);
        const answer = this.getString(record.answer);

        return question && answer ? { answer, question } : null;
      })
      .filter((item): item is FaqParam => item !== null);
  }

  private getHowToSteps(value: unknown): HowToStepParam[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item): HowToStepParam | null => {
        if (typeof item === 'string') {
          const text = item.trim();
          return text ? { text } : null;
        }

        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const text = this.getString(record.text);
        return text ? { name: this.getString(record.name), text } : null;
      })
      .filter((item): item is HowToStepParam => item !== null);
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private getStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private firstSentence(value: string): string {
    return value.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  }

  private dedupe(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }
}
