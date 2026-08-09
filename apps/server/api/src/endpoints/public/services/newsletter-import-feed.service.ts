import { BrandsService } from '@api/collections/brands/services/brands.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { sanitizeHtml } from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';
import { marked } from 'marked';
import RSS from 'rss';

const PUBLISHED_NEWSLETTER_STATUS = 'published';
const CONTENT_NAMESPACE = 'http://purl.org/rss/1.0/modules/content/';

interface NewsletterImportRecord {
  id: string;
  brandId?: string | null;
  content?: string | null;
  createdAt?: Date;
  isDeleted?: boolean;
  label: string;
  publishedAt?: Date | null;
  status: string;
  summary?: string | null;
  updatedAt?: Date;
}

interface NewsletterFeedBrand {
  id: string;
  label?: string | null;
  slug?: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function versionedApiUrl(value: string): string {
  const baseUrl = trimTrailingSlash(value);
  return baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Injectable()
export class NewsletterImportFeedService {
  private readonly apiUrl: string;
  private readonly siteUrl: string;

  constructor(
    private readonly brandsService: BrandsService,
    private readonly newslettersService: NewslettersService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = versionedApiUrl(
      this.configService.get('GENFEEDAI_API_URL') ?? '',
    );
    this.siteUrl = trimTrailingSlash(
      this.configService.get('GENFEEDAI_APP_URL') ?? '',
    );
  }

  async generateBrandFeed(brandId: string): Promise<string> {
    const brand = await this.findPublicFeedBrand(brandId);
    const newsletters = await this.findPublishedNewsletters(brandId);
    const feedUrl = `${this.apiUrl}/public/rss/brands/${brandId}/newsletters`;
    const siteUrl = brand.slug
      ? `${this.siteUrl}/u/${brand.slug}`
      : this.siteUrl;
    const latestChange = newsletters.reduce<Date>((latest, newsletter) => {
      const candidate =
        newsletter.updatedAt ??
        newsletter.publishedAt ??
        newsletter.createdAt ??
        new Date(0);
      return candidate > latest ? candidate : latest;
    }, new Date(0));

    const feed = new RSS({
      custom_namespaces: { content: CONTENT_NAMESPACE },
      description: `Published newsletter archive from ${brand.label ?? 'Genfeed'}`,
      feed_url: feedUrl,
      language: 'en',
      pubDate: latestChange,
      site_url: siteUrl,
      title: `${brand.label ?? 'Genfeed'} Newsletter`,
      ttl: 10,
    });

    for (const newsletter of newsletters) {
      const canonicalUrl = this.buildCanonicalUrl(newsletter.id);
      feed.item({
        custom_elements: [
          {
            'content:encoded': {
              _cdata: this.renderContent(newsletter.content ?? ''),
            },
          },
        ],
        date: newsletter.publishedAt ?? new Date(0),
        description: newsletter.summary?.trim() || newsletter.label,
        guid: `urn:genfeed:newsletter:${newsletter.id}`,
        title: newsletter.label,
        url: canonicalUrl,
      });
    }

    return feed
      .xml()
      .replace(
        /<lastBuildDate>[^<]*<\/lastBuildDate>/,
        `<lastBuildDate>${latestChange.toUTCString()}</lastBuildDate>`,
      );
  }

  async generateCanonicalPage(newsletterId: string): Promise<string> {
    const newsletter = (await this.newslettersService.findOne({
      content: { not: null },
      id: newsletterId,
      isDeleted: false,
      publishedAt: { not: null },
      status: PUBLISHED_NEWSLETTER_STATUS,
    })) as NewsletterImportRecord | null;

    if (!newsletter?.brandId || !newsletter.content?.trim()) {
      throw new NotFoundException('Newsletter', newsletterId);
    }

    await this.findPublicFeedBrand(newsletter.brandId);

    const canonicalUrl = this.buildCanonicalUrl(newsletter.id);
    const title = escapeHtmlText(newsletter.label);
    const summary = escapeHtmlText(
      newsletter.summary?.trim() || newsletter.label,
    );
    const publishedAt = newsletter.publishedAt ?? new Date(0);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${summary}">
  <link rel="canonical" href="${escapeHtmlText(canonicalUrl)}">
  <title>${title}</title>
</head>
<body>
  <main>
    <article>
      <header>
        <h1>${title}</h1>
        <time datetime="${publishedAt.toISOString()}">${publishedAt.toISOString()}</time>
      </header>
      ${this.renderContent(newsletter.content)}
    </article>
  </main>
</body>
</html>`;
  }

  private buildCanonicalUrl(newsletterId: string): string {
    return `${this.apiUrl}/public/newsletters/${newsletterId}`;
  }

  private async findPublicFeedBrand(
    brandId: string,
  ): Promise<NewsletterFeedBrand> {
    const brand = (await this.brandsService.findOne({
      id: brandId,
      isDeleted: false,
    })) as NewsletterFeedBrand | null;

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    return brand;
  }

  private async findPublishedNewsletters(
    brandId: string,
  ): Promise<NewsletterImportRecord[]> {
    const result = await this.newslettersService.findAll(
      {
        orderBy: [{ publishedAt: -1 }, { id: 1 }],
        where: {
          brandId,
          content: { not: null },
          isDeleted: false,
          publishedAt: { not: null },
          status: PUBLISHED_NEWSLETTER_STATUS,
        },
      },
      { pagination: false },
      false,
    );

    return (result.docs as NewsletterImportRecord[]).filter((newsletter) =>
      newsletter.content?.trim(),
    );
  }

  private renderContent(content: string): string {
    return sanitizeHtml(marked.parse(content, { async: false }));
  }
}
