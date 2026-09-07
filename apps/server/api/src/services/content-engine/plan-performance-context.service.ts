import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import {
  type PerformanceDataset,
  PerformanceSummaryService,
  type WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Planning looks further back than the weekly summary's default window. */
export const PLAN_PERFORMANCE_WINDOW_DAYS = 30;
const TOP_PERFORMER_LIMIT = 5;
const COMPETITOR_AD_LIMIT = 5;
const CREATIVE_PATTERN_LIMIT = 5;
const FOLLOWED_CORPUS_LIMIT = 10;
const FOLLOWED_CORPUS_MAX_CHARS = 1500;

export interface PlanPerformanceContext {
  dataset: PerformanceDataset;
  /**
   * True when the brand's own history (Genfeed plus imported posts) is too
   * thin to plan from, so the plan is seeded from competitor ads, creative
   * patterns and followed creators instead.
   */
  isColdStart: boolean;
  /** Prompt-ready section, empty when nothing is available. */
  section: string;
}

/**
 * Grounds content planning in real performance data. With enough own history
 * the section lists what already works for the brand; with too little it
 * switches to a cold-start brief built from the competitor ads the brand
 * watches, extracted creative patterns and the followed-creator corpus, so the
 * first plan after connecting is informed rather than generic.
 */
@Injectable()
export class PlanPerformanceContextService {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly adPerformanceService: AdPerformanceService,
    private readonly patternMatcherService: PatternMatcherService,
    private readonly sourcePostsService: SourcePostsService,
    private readonly logger: LoggerService,
  ) {}

  async build(params: {
    organizationId: string;
    brandId: string;
  }): Promise<PlanPerformanceContext> {
    const summary = await this.loadSummary(params);
    const dataset: PerformanceDataset = summary?.dataset ?? {
      confidence: 'none',
      genfeedPosts: 0,
      importedPosts: 0,
      totalPosts: 0,
    };
    const isColdStart =
      dataset.confidence === 'none' || dataset.confidence === 'low';

    const sections: string[] = [];
    if (summary) {
      const ownHistory = this.describeOwnHistory(summary);
      if (ownHistory) sections.push(ownHistory);
    }
    if (isColdStart) {
      const coldStart = await this.describeColdStartSources(params, dataset);
      if (coldStart) sections.push(coldStart);
    }

    return { dataset, isColdStart, section: sections.join('\n\n') };
  }

  private async loadSummary(params: {
    organizationId: string;
    brandId: string;
  }): Promise<WeeklySummary | undefined> {
    try {
      return await this.performanceSummaryService.getWeeklySummary(
        params.organizationId,
        params.brandId,
        {
          startDate: new Date(
            Date.now() - PLAN_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          ),
          topN: TOP_PERFORMER_LIMIT,
          worstN: 3,
        },
      );
    } catch (error: unknown) {
      this.logger.warn('Plan context: performance summary unavailable', {
        brandId: params.brandId,
        error: (error as Error)?.message,
      });
      return undefined;
    }
  }

  private describeOwnHistory(summary: WeeklySummary): string {
    const { dataset } = summary;
    if (dataset.totalPosts === 0) {
      return '';
    }
    const lines: string[] = [
      `Own history (last ${PLAN_PERFORMANCE_WINDOW_DAYS} days): ${dataset.genfeedPosts} Genfeed ${plural(dataset.genfeedPosts, 'post')} and ${dataset.importedPosts} imported ${plural(dataset.importedPosts, 'post')} from connected accounts (${dataset.confidence} confidence).`,
    ];
    for (const item of summary.topPerformers.slice(0, TOP_PERFORMER_LIMIT)) {
      const label = sanitize(item.title || item.description, 140);
      if (!label) continue;
      const provenance =
        item.origin === 'imported' ? ', imported from your account' : '';
      lines.push(
        `- Winning: "${label}" on ${sanitize(item.platform, 40)}${provenance} (${item.engagementRate.toFixed(2)}% engagement).`,
      );
    }
    for (const item of summary.worstPerformers.slice(0, 2)) {
      const label = sanitize(item.title || item.description, 140);
      if (!label) continue;
      lines.push(
        `- Avoid repeating: "${label}" (${item.engagementRate.toFixed(2)}% engagement).`,
      );
    }
    const platforms = summary.avgEngagementByPlatform
      .slice(0, 3)
      .map(
        (row) =>
          `${sanitize(row.platform, 40)} ${row.avgEngagementRate.toFixed(2)}%`,
      );
    if (platforms.length > 0) {
      lines.push(`- Best platforms by engagement: ${platforms.join(', ')}.`);
    }
    const hours = summary.bestPostingTimes
      .slice(0, 3)
      .map((row) => `${row.hour}:00 UTC`);
    if (hours.length > 0) {
      lines.push(`- Best posting hours: ${hours.join(', ')}.`);
    }
    if (summary.topHooks.length > 0) {
      lines.push(
        `- Hooks that worked: ${summary.topHooks
          .slice(0, 3)
          .map((hook) => `"${sanitize(hook, 100)}"`)
          .join(', ')}.`,
      );
    }
    return lines.join('\n');
  }

  private async describeColdStartSources(
    params: { organizationId: string; brandId: string },
    dataset: PerformanceDataset,
  ): Promise<string> {
    const [ads, patterns, corpus] = await Promise.all([
      this.loadCompetitorAds(params),
      this.loadCreativePatterns(params),
      this.loadFollowedCorpus(params),
    ]);
    if (ads.length === 0 && patterns.length === 0 && !corpus) {
      return dataset.totalPosts === 0
        ? 'Cold start: this brand has no post history yet and no competitor research. Plan foundational content that establishes the brand voice and tests two or three formats.'
        : '';
    }
    const lines: string[] = [
      `Cold start: only ${dataset.totalPosts} own ${plural(dataset.totalPosts, 'post')} in the window, so seed this plan from what is already working around the brand and turn it into first-party content:`,
    ];
    if (ads.length > 0) {
      lines.push('Competitor and reference ads winning now:');
      lines.push(...ads);
    }
    if (patterns.length > 0) {
      lines.push('Creative patterns extracted from top-performing content:');
      lines.push(...patterns);
    }
    if (corpus) {
      lines.push('Recent posts from creators the brand follows:');
      lines.push(corpus);
    }
    lines.push(
      'Adapt these angles to the brand voice; never copy competitor copy verbatim.',
    );
    return lines.join('\n');
  }

  private async loadCompetitorAds(params: {
    organizationId: string;
    brandId: string;
  }): Promise<string[]> {
    try {
      const ads = await this.adPerformanceService.findTopPerformers({
        brandId: params.brandId,
        limit: COMPETITOR_AD_LIMIT,
        metric: 'performanceScore',
        organizationId: params.organizationId,
      });
      return ads.flatMap((ad) => {
        const record = ad as Record<string, unknown>;
        const headline = sanitize(readString(record.headlineText), 120);
        const body = sanitize(readString(record.bodyText), 200);
        const cta = sanitize(readString(record.ctaText), 40);
        if (!headline && !body) return [];
        const advertiser = sanitize(
          readString(record.advertiserName) ?? readString(record.pageName),
          60,
        );
        const platform = sanitize(readString(record.adPlatform), 30);
        const score = readNumber(record.performanceScore);
        const parts = [
          headline ? `"${headline}"` : '',
          body ? `— ${body}` : '',
          cta ? `[CTA: ${cta}]` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const meta = [
          advertiser ? `by ${advertiser}` : '',
          platform ? `on ${platform}` : '',
          score !== undefined ? `score ${score.toFixed(0)}` : '',
        ]
          .filter(Boolean)
          .join(', ');
        return [`- ${parts}${meta ? ` (${meta})` : ''}`];
      });
    } catch (error: unknown) {
      this.logger.warn('Plan context: competitor ads unavailable', {
        brandId: params.brandId,
        error: (error as Error)?.message,
      });
      return [];
    }
  }

  private async loadCreativePatterns(params: {
    organizationId: string;
    brandId: string;
  }): Promise<string[]> {
    try {
      const patterns = await this.patternMatcherService.getTopPatternsForBrand(
        params.organizationId,
        params.brandId,
        { limit: CREATIVE_PATTERN_LIMIT },
      );
      return (patterns ?? []).flatMap((pattern) => {
        const record = pattern as Record<string, unknown>;
        const label = sanitize(readString(record.label), 80);
        const formula = sanitize(readString(record.formula), 160);
        if (!label && !formula) return [];
        const example = Array.isArray(record.examples)
          ? readString(
              (record.examples[0] as Record<string, unknown> | undefined)?.text,
            )
          : undefined;
        const exampleText = sanitize(example, 120);
        return [
          `- ${label || 'Pattern'}${formula ? `: ${formula}` : ''}${exampleText ? ` (e.g. "${exampleText}")` : ''}`,
        ];
      });
    } catch (error: unknown) {
      this.logger.warn('Plan context: creative patterns unavailable', {
        brandId: params.brandId,
        error: (error as Error)?.message,
      });
      return [];
    }
  }

  private async loadFollowedCorpus(params: {
    organizationId: string;
    brandId: string;
  }): Promise<string> {
    try {
      const result = await this.sourcePostsService.getWeeklyCorpus(
        params.organizationId,
        params.brandId,
        PLAN_PERFORMANCE_WINDOW_DAYS,
        FOLLOWED_CORPUS_LIMIT,
      );
      if (result.count === 0) {
        return '';
      }
      return sanitize(result.corpus, FOLLOWED_CORPUS_MAX_CHARS);
    } catch (error: unknown) {
      this.logger.warn('Plan context: followed corpus unavailable', {
        brandId: params.brandId,
        error: (error as Error)?.message,
      });
      return '';
    }
  }
}

function sanitize(value: string | undefined, maxLength: number): string {
  return value ? SecurityUtil.sanitizePromptInput(value, maxLength) : '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
