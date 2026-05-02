import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ConfigService } from '@api/config/config.service';
import { ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import RSS from 'rss';

interface ArticleFeed {
  label: string;
  summary: string;
  slug: string;
  content: string;
  publishedAt?: Date;
  createdAt?: Date;
}

@Injectable()
export class RssService {
  private readonly apiUrl: string;
  private readonly siteUrl: string;

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get('GENFEEDAI_API_URL') ?? '';
    this.siteUrl = this.configService.get('GENFEEDAI_APP_URL') ?? '';
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
          status: ArticleStatus.PUBLIC,
        },
        orderBy: { createdAt: -1, publishedAt: -1 },
      },
      { pagination: false },
    );
    const articles = result.docs as ArticleFeed[];

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: `${this.siteUrl}/articles/${article.slug}`,
        title: article.label,
        url: `${this.siteUrl}/articles/${article.slug}`,
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
          status: ArticleStatus.PUBLIC,
          user: userId,
        },
        orderBy: { createdAt: -1, publishedAt: -1 },
      },
      { pagination: false },
    );
    const articles = result.docs as ArticleFeed[];

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: `${this.siteUrl}/articles/${article.slug}`,
        title: article.label,
        url: `${this.siteUrl}/articles/${article.slug}`,
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
          brand: brandId,
          isDeleted: false,
          scope: ArticleScope.PUBLIC,
          status: ArticleStatus.PUBLIC,
        },
        orderBy: { createdAt: -1, publishedAt: -1 },
      },
      { pagination: false },
    );
    const articles = result.docs as ArticleFeed[];

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: `${this.siteUrl}/articles/${article.slug}`,
        title: article.label,
        url: `${this.siteUrl}/articles/${article.slug}`,
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
          organization: organizationId,
          scope: ArticleScope.PUBLIC,
          status: ArticleStatus.PUBLIC,
        },
        orderBy: { createdAt: -1, publishedAt: -1 },
      },
      { pagination: false },
    );
    const articles = result.docs as ArticleFeed[];

    // Add articles to feed
    for (const article of articles) {
      feed.item({
        custom_elements: [{ 'content:encoded': { _cdata: article.content } }],
        date: article.publishedAt || article.createdAt || new Date(),
        description: article.summary,
        guid: `${this.siteUrl}/articles/${article.slug}`,
        title: article.label,
        url: `${this.siteUrl}/articles/${article.slug}`,
      });
    }

    return feed.xml();
  }
}
