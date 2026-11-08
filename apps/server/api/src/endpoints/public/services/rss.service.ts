import { ArticlesService } from '@api/collections/articles/services/articles.service';
import {
  PUBLIC_ARTICLE_BRAND_INCLUDE,
  stripPrivateBrand,
} from '@api/helpers/utils/public-brand/public-brand-filter.util';
import { ArticleScope } from '@genfeedai/contracts';
import {
  articleHandle,
  creatorArticlePath,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import RSS from 'rss';

interface ArticleFeed {
  label: string;
  summary: string;
  slug: string;
  content: string;
  publishedAt?: Date;
  createdAt?: Date;
  brand?: { slug?: string | null } | null;
}

const TRAILING_SLASH_PATTERN = /\/+$/;

/** A feed carries the newest items only; readers never page through RSS. */
const RSS_ITEM_LIMIT = 50;

/** Newest published first, `id` keeps the cut stable across ties. */
const RSS_FEED_ORDER = [
  { publishedAt: -1 },
  { createdAt: -1 },
  { id: -1 },
] as const;

@Traced()
@Injectable()
export class RssService {
  private readonly apiUrl: string;
  private readonly siteUrl: string;

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.apiUrl;
    // Articles live on the public website, not in the app.
    this.siteUrl = (
      this.configService.get('GENFEEDAI_PUBLIC_URL') ?? ''
    ).replace(TRAILING_SLASH_PATTERN, '');
  }

  private articleUrl(article: ArticleFeed): string {
    return `${this.siteUrl}${creatorArticlePath(
      articleHandle(article.brand?.slug),
      article.slug,
    )}`;
  }

  /**
   * Generate global RSS feed with all public published articles
   */
  async generateGlobalFeed(): Promise<string> {
    const feed = new RSS({
      description: 'AI-powered content from Genfeed',
      feed_url: `${this.apiUrl}/rss/articles`,
      language: 'en',
      pubDate: new Date(),
      site_url: this.siteUrl,
      title: 'Genfeed Articles',
      ttl: 60, // Cache for 60 minutes
    });

    // Get all public published articles
    const result = await this.articlesService.findAll(
      {
        where: {
          isDeleted: false,
          scope: ArticleScope.PUBLIC,
          ...(await this.articlesService.publicArticleScope.buildWhere()),
        },
        include: PUBLIC_ARTICLE_BRAND_INCLUDE,
        orderBy: RSS_FEED_ORDER,
      },
      { limit: RSS_ITEM_LIMIT, pagination: false },
    );
    const articles = (result.docs as ArticleFeed[]).map(stripPrivateBrand);

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: this.articleUrl(article),
        title: article.label,
        url: this.articleUrl(article),
      });
    }

    return feed.xml();
  }

  /**
   * Generate RSS feed for a specific user's public articles
   */
  async generateUserFeed(userId: string): Promise<string> {
    const feed = new RSS({
      description: `AI-powered content by user ${userId}`,
      feed_url: `${this.apiUrl}/rss/users/${userId}`,
      language: 'en',
      pubDate: new Date(),
      site_url: this.siteUrl,
      title: `Genfeed Articles by User ${userId}`,
      ttl: 60,
    });

    // Get user's public published articles
    const result = await this.articlesService.findAll(
      {
        where: {
          isDeleted: false,
          scope: ArticleScope.PUBLIC,
          ...(await this.articlesService.publicArticleScope.buildWhere()),
          userId: userId,
        },
        include: PUBLIC_ARTICLE_BRAND_INCLUDE,
        orderBy: RSS_FEED_ORDER,
      },
      { limit: RSS_ITEM_LIMIT, pagination: false },
    );
    const articles = (result.docs as ArticleFeed[]).map(stripPrivateBrand);

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: this.articleUrl(article),
        title: article.label,
        url: this.articleUrl(article),
      });
    }

    return feed.xml();
  }

  /**
   * Generate RSS feed for a specific brand's public articles
   */
  async generateBrandFeed(brandId: string): Promise<string> {
    const feed = new RSS({
      description: `AI-powered content by brand ${brandId}`,
      feed_url: `${this.apiUrl}/rss/brands/${brandId}`,
      language: 'en',
      pubDate: new Date(),
      site_url: this.siteUrl,
      title: `Genfeed Articles by Brand ${brandId}`,
      ttl: 60,
    });

    // Get brand's public published articles
    const result = await this.articlesService.findAll(
      {
        where: {
          brandId: brandId,
          isDeleted: false,
          scope: ArticleScope.PUBLIC,
          ...(await this.articlesService.publicArticleScope.buildWhere()),
        },
        include: PUBLIC_ARTICLE_BRAND_INCLUDE,
        orderBy: RSS_FEED_ORDER,
      },
      { limit: RSS_ITEM_LIMIT, pagination: false },
    );
    const articles = (result.docs as ArticleFeed[]).map(stripPrivateBrand);

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: this.articleUrl(article),
        title: article.label,
        url: this.articleUrl(article),
      });
    }

    return feed.xml();
  }

  /**
   * Generate RSS feed for a specific organization's public articles
   */
  async generateOrganizationFeed(organizationId: string): Promise<string> {
    const feed = new RSS({
      description: `AI-powered content by organization ${organizationId}`,
      feed_url: `${this.apiUrl}/rss/organizations/${organizationId}`,
      language: 'en',
      pubDate: new Date(),
      site_url: this.siteUrl,
      title: `Genfeed Articles by Organization ${organizationId}`,
      ttl: 60,
    });

    // Get organization's public published articles
    const result = await this.articlesService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: organizationId,
          scope: ArticleScope.PUBLIC,
          ...(await this.articlesService.publicArticleScope.buildWhere()),
        },
        include: PUBLIC_ARTICLE_BRAND_INCLUDE,
        orderBy: RSS_FEED_ORDER,
      },
      { limit: RSS_ITEM_LIMIT, pagination: false },
    );
    const articles = (result.docs as ArticleFeed[]).map(stripPrivateBrand);

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: this.articleUrl(article),
        title: article.label,
        url: this.articleUrl(article),
      });
    }

    return feed.xml();
  }
}
