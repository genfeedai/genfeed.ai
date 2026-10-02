import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  ArticleTraffic,
  ArticleTrafficDay,
  ArticleTrafficInput,
} from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

const DAY_MS = 86_400_000;
const QUERY_ORIGINS = new Set([
  'https://eu.posthog.com',
  'https://us.posthog.com',
]);

@Injectable()
export class ArticleTrafficService {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async getTraffic(
    input: ArticleTrafficInput,
    now: Date = new Date(),
  ): Promise<ArticleTraffic> {
    // Match the editor/list visibility boundary; never trust a client-supplied slug.
    const article = await this.articlesService.findOne(
      scopedWhere(input.organizationId, {
        id: input.articleId,
        ...(input.brandId ? { brandId: input.brandId } : {}),
        OR: [{ userId: input.userId }, { scope: 'ORGANIZATION' }],
      }),
    );
    if (!article) throw new NotFoundException('Article', input.articleId);

    const slug = article.slug;
    const publication = article.publishedAt
      ? new Date(article.publishedAt)
      : null;
    const publishedAt =
      publication && Number.isFinite(publication.getTime())
        ? publication
        : null;
    const endDate = now.toISOString();
    const days =
      input.period === 'all' ? null : Number(input.period.slice(0, -1));
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const requestedStart =
      days === null
        ? (publishedAt?.getTime() ?? now.getTime())
        : midnight - (days - 1) * DAY_MS;
    const start = new Date(
      Math.max(requestedStart, publishedAt?.getTime() ?? requestedStart),
    );
    const base: ArticleTraffic = {
      articleId: input.articleId,
      days: [],
      endDate,
      period: input.period,
      reason: null,
      startDate: start.toISOString(),
      status: 'unavailable',
      totalResourceClicks: null,
      totalViews: null,
    };
    const unavailable = (reason: ArticleTraffic['reason']): ArticleTraffic => ({
      ...base,
      reason,
    });
    if (
      !publishedAt ||
      !Number.isFinite(publishedAt.getTime()) ||
      publishedAt > now ||
      typeof slug !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
      return unavailable('not_published');
    }
    // Public slug lookup is global. Prove this is the actual canonical public row
    // before exposing historical URL traffic to an organization with the same slug.
    const canonical = await this.articlesService.findPublicArticleBySlug(slug);
    if (!canonical) return unavailable('not_published');
    if (canonical.id !== article.id) return unavailable('not_canonical');

    const apiKey = this.configService.get('POSTHOG_QUERY_API_KEY') as
      | string
      | undefined;
    const projectId = String(
      this.configService.get('POSTHOG_PROJECT_ID') ?? '',
    );
    const queryHost = String(
      this.configService.get('POSTHOG_QUERY_HOST') || 'https://eu.posthog.com',
    ).replace(/\/$/, '');
    if (
      !apiKey ||
      !/^[1-9]\d*$/.test(projectId) ||
      !QUERY_ORIGINS.has(queryHost)
    )
      return unavailable('not_configured');

    let hostname: string;
    try {
      const publicUrl = new URL(
        String(
          this.configService.get('GENFEEDAI_PUBLIC_URL') ||
            'https://genfeed.ai',
        ),
      );
      hostname = publicUrl.hostname;
      if (publicUrl.protocol !== 'https:' || !/^[a-z0-9.-]+$/.test(hostname))
        return unavailable('not_configured');
    } catch {
      return unavailable('not_configured');
    }

    const query = `SELECT toString(toDate(toTimeZone(timestamp, 'UTC'))) AS day,
      countIf(event = '$pageview') AS views,
      countIf(event = 'article_cta_clicked') AS resource_clicks
      FROM events
      WHERE timestamp >= toDateTime('${base.startDate}') AND timestamp <= toDateTime('${endDate}')
        AND properties.$host = '${hostname}'
        AND ((event = '$pageview' AND properties.$pathname = '/articles/${slug}'
          AND properties.$current_url NOT LIKE '%previewToken=%')
          OR (event = 'article_cta_clicked' AND properties.articleSlug = '${slug}'))
      GROUP BY day ORDER BY day LIMIT 10000`;
    try {
      const response = await safeFetch(
        `${queryHost}/api/projects/${projectId}/query/`,
        {
          body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        },
        {
          allowedOrigins: [queryHost],
          allowedSchemes: ['https:'],
          maxRedirects: 0,
        },
      );
      if (!response.ok) throw new Error('Query unavailable');
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('results' in payload) ||
        !Array.isArray(payload.results)
      )
        throw new Error('Invalid query response');
      const byDay = new Map<string, ArticleTrafficDay>();
      for (const row of payload.results) {
        if (
          !Array.isArray(row) ||
          row.length !== 3 ||
          typeof row[0] !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row[0])
        )
          throw new Error('Invalid traffic row');
        if (
          row
            .slice(1)
            .some(
              (value) =>
                typeof value !== 'number' &&
                (typeof value !== 'string' || !/^\d+$/.test(value)),
            )
        )
          throw new Error('Invalid traffic counts');
        const views = Number(row[1]);
        const resourceClicks = Number(row[2]);
        if (
          !Number.isSafeInteger(views) ||
          views < 0 ||
          !Number.isSafeInteger(resourceClicks) ||
          resourceClicks < 0
        )
          throw new Error('Invalid traffic counts');
        if (
          row[0] < base.startDate.slice(0, 10) ||
          row[0] > endDate.slice(0, 10) ||
          byDay.has(row[0])
        )
          throw new Error('Invalid traffic date');
        byDay.set(row[0], { date: row[0], resourceClicks, views });
      }
      const history: ArticleTrafficDay[] = [];
      for (
        let cursor = Date.parse(`${base.startDate.slice(0, 10)}T00:00:00Z`);
        cursor <= midnight;
        cursor += DAY_MS
      ) {
        const date = new Date(cursor).toISOString().slice(0, 10);
        history.push(byDay.get(date) ?? { date, resourceClicks: 0, views: 0 });
      }
      return {
        ...base,
        days: history,
        status: 'available',
        totalResourceClicks: history.reduce(
          (sum, day) => sum + day.resourceClicks,
          0,
        ),
        totalViews: history.reduce((sum, day) => sum + day.views, 0),
      };
    } catch {
      // Do not log upstream bodies, query text, credentials or reader identities.
      this.logger.warn('Article website traffic query unavailable');
      return unavailable('upstream_error');
    }
  }
}
