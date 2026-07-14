import type { WebsiteScrapingResult } from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { IScrapedBrandData } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

const MAX_IMAGE_CANDIDATES = 12;
const MAX_FONT_CANDIDATES = 8;

@Injectable()
export class BrandWebsiteParserService {
  parseHtml(html: string, sourceUrl: string): WebsiteScrapingResult {
    return this.extractFromDom(cheerio.load(html), sourceUrl);
  }

  /**
   * Extract all brand data from parsed HTML DOM
   */
  private extractFromDom(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
  ): WebsiteScrapingResult {
    const title = $('title').first().text().trim() || undefined;
    const description =
      $('meta[name="description"]').attr('content')?.trim() || undefined;
    const ogTitle =
      $('meta[property="og:title"]').attr('content')?.trim() || undefined;
    const ogDescription =
      $('meta[property="og:description"]').attr('content')?.trim() || undefined;
    const ogImage =
      $('meta[property="og:image"]').attr('content')?.trim() ||
      $(
        'meta[name="twitter:image"], meta[property="twitter:image"], meta[name="twitter:image:src"]',
      )
        .first()
        .attr('content')
        ?.trim() ||
      undefined;
    const favicon =
      $('link[rel="icon"]').attr('href')?.trim() ||
      $('link[rel="shortcut icon"]').attr('href')?.trim() ||
      undefined;
    const canonical =
      $('link[rel="canonical"]').attr('href')?.trim() || undefined;

    // Extract social links from <a> hrefs
    const allLinks: string[] = [];
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href) {
        allLinks.push(href);
      }
    });
    const socialLinks = this.extractSocialLinks(allLinks);

    // Extract colors from theme-color meta, <style> tags, inline styles
    const colors = this.extractColorsFromDom($);
    const fonts = this.extractFontsFromDom($);

    // Extract headings
    const headings = this.extractHeadingsFromDom($);

    // Extract body text for about/value prop extraction
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Extract value propositions
    const valuePropositions = this.extractValuePropositions(bodyText);
    const aboutText = this.extractAboutText(bodyText);

    // Extract logo
    const logoUrl = this.extractLogoFromDom($, sourceUrl);
    const images = this.extractImagesFromDom($, sourceUrl);
    const bannerUrl = this.extractBannerFromDom(
      $,
      sourceUrl,
      ogImage,
      images,
      logoUrl,
    );

    return {
      aboutText,
      bannerUrl,
      canonical,
      colors,
      description,
      favicon,
      fonts,
      headings,
      heroText: headings[0],
      images,
      logoUrl,
      ogDescription,
      ogImage,
      ogTitle,
      paragraphs: [],
      scrapedAt: new Date(),
      socialLinks,
      sourceUrl,
      title,
      valuePropositions,
    };
  }

  /**
   * Extract brand data from scraped website content
   */
  extractBrandData(
    scrapedContent: WebsiteScrapingResult,
    sourceUrl: string,
  ): IScrapedBrandData {
    const companyName = this.extractCompanyName(
      scrapedContent.title,
      scrapedContent.ogTitle,
    );

    const valuePropositions =
      scrapedContent.valuePropositions.length > 0
        ? scrapedContent.valuePropositions
        : scrapedContent.headings.slice(0, 5);

    return {
      aboutText: scrapedContent.aboutText,
      bannerUrl: scrapedContent.bannerUrl,
      companyName,
      description: scrapedContent.description || scrapedContent.ogDescription,
      fontCandidates: scrapedContent.fonts,
      fontFamily: scrapedContent.fonts[0],
      heroText: scrapedContent.heroText,
      logoUrl: scrapedContent.logoUrl,
      metaDescription: scrapedContent.description,
      ogImage: scrapedContent.ogImage,
      primaryColor: scrapedContent.colors.primary,
      referenceImageUrls: scrapedContent.images
        .map((image) => image.src)
        .filter(
          (src, index, all) =>
            src !== scrapedContent.logoUrl &&
            src !== scrapedContent.bannerUrl &&
            all.indexOf(src) === index,
        )
        .slice(0, MAX_IMAGE_CANDIDATES),
      scrapedAt: scrapedContent.scrapedAt,
      secondaryColor: scrapedContent.colors.secondary,
      socialLinks: scrapedContent.socialLinks,
      sourceUrl,
      tagline: scrapedContent.heroText || scrapedContent.ogTitle,
      valuePropositions,
    };
  }

  /**
   * Extract company name from title
   */
  extractCompanyName(title?: string, ogTitle?: string): string | undefined {
    const source = title || ogTitle;
    if (!source) {
      return undefined;
    }

    const separators = [' | ', ' - ', ' – ', ' — '];
    for (const sep of separators) {
      if (source.includes(sep)) {
        return source.split(sep)[0].trim();
      }
    }

    return source.trim();
  }

  /**
   * Extract social media links from page links
   */
  private extractSocialLinks(
    links: string[],
  ): WebsiteScrapingResult['socialLinks'] {
    const socialHosts: Record<string, string[]> = {
      facebook: ['facebook.com'],
      instagram: ['instagram.com'],
      linkedin: ['linkedin.com'],
      tiktok: ['tiktok.com'],
      twitter: ['twitter.com', 'x.com'],
      youtube: ['youtube.com'],
    };

    const result: WebsiteScrapingResult['socialLinks'] = {};

    for (const link of links) {
      let url: URL;
      try {
        url = new URL(link, 'https://relative-link.invalid');
      } catch {
        continue;
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        continue;
      }

      const hostname = url.hostname.toLowerCase();
      for (const [platform, hosts] of Object.entries(socialHosts)) {
        const isSocialHost = hosts.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`),
        );
        if (isSocialHost && !result[platform as keyof typeof result]) {
          result[platform as keyof typeof result] = link;
        }
      }
    }

    return result;
  }

  /**
   * Extract colors from DOM: theme-color meta, <style> tags, inline styles
   */
  private extractColorsFromDom(
    $: cheerio.CheerioAPI,
  ): WebsiteScrapingResult['colors'] {
    const colorCounts = new Map<string, number>();

    const addColor = (color: string, weight = 1): void => {
      const normalized = color.toLowerCase().trim();
      if (
        ['#000', '#000000', '#fff', '#ffffff', 'transparent', '#0000'].includes(
          normalized,
        )
      ) {
        return;
      }
      colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + weight);
    };

    // Theme-color meta tag (high weight)
    const themeColor = $('meta[name="theme-color"]').attr('content')?.trim();
    if (themeColor) {
      addColor(themeColor, 5);
    }

    // msapplication-TileColor
    const tileColor = $('meta[name="msapplication-TileColor"]')
      .attr('content')
      ?.trim();
    if (tileColor) {
      addColor(tileColor, 3);
    }

    // Extract from <style> tags and inline style attributes
    const cssText: string[] = [];
    $('style').each((_i, el) => {
      cssText.push($(el).text());
    });
    $('[style]').each((_i, el) => {
      const style = $(el).attr('style');
      if (style) {
        cssText.push(style);
      }
    });

    const allCss = cssText.join(' ');

    // Extract hex colors
    const hexMatches = allCss.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g);
    if (hexMatches) {
      for (const hex of hexMatches) {
        addColor(hex);
      }
    }

    // Extract rgb/rgba colors
    const rgbMatches = allCss.match(
      /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g,
    );
    if (rgbMatches) {
      for (const rgb of rgbMatches) {
        addColor(rgb);
      }
    }

    // Sort by frequency
    const sorted = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);

    return {
      accent: sorted.slice(2, 6),
      background: undefined,
      primary: sorted[0],
      secondary: sorted[1],
    };
  }

  private extractFontsFromDom($: cheerio.CheerioAPI): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const addFont = (font: string): void => {
      const normalized = font
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .find((part) => part.length > 0);

      if (
        !normalized ||
        /^(system-ui|sans-serif|serif|monospace|inherit|initial|var\()/i.test(
          normalized,
        ) ||
        seen.has(normalized)
      ) {
        return;
      }

      seen.add(normalized);
      candidates.push(normalized);
    };

    $('link[href*="fonts.googleapis.com"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }
      try {
        const family = new URL(
          href,
          'https://fonts.googleapis.com',
        ).searchParams
          .get('family')
          ?.split(':')[0]
          ?.replace(/\+/g, ' ');
        if (family) {
          addFont(family);
        }
      } catch {
        // Ignore malformed stylesheet URLs; inline declarations still apply.
      }
    });

    const cssText: string[] = [];
    $('style').each((_i, el) => {
      cssText.push($(el).text());
    });
    $('[style]').each((_i, el) => {
      const style = $(el).attr('style');
      if (style) {
        cssText.push(style);
      }
    });

    const fontMatches = cssText
      .join(' ')
      .matchAll(/font-family\s*:\s*([^;{}]+)/gi);
    for (const match of fontMatches) {
      if (match[1]) {
        addFont(match[1]);
      }
    }

    return candidates.slice(0, MAX_FONT_CANDIDATES);
  }

  /**
   * Extract headings from DOM
   */
  private extractHeadingsFromDom($: cheerio.CheerioAPI): string[] {
    const headings: string[] = [];

    $('h1, h2').each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 3 && text.length < 200) {
        headings.push(text);
      }
    });

    return [...new Set(headings)].slice(0, 10);
  }

  /**
   * Extract logo URL from DOM
   */
  extractLogoFromDom(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
  ): string | undefined {
    // Check for common logo patterns
    const logoSelectors = [
      'img[class*="logo"]',
      'img[id*="logo"]',
      'img[alt*="logo"]',
      'a[class*="logo"] img',
      'header img:first-of-type',
      '.logo img',
      '#logo img',
    ];

    for (const selector of logoSelectors) {
      const src = $(selector).first().attr('src');
      if (src) {
        return this.resolveUrl(src, sourceUrl);
      }
    }

    // Check for apple-touch-icon as fallback
    const touchIcon = $('link[rel="apple-touch-icon"]').attr('href');
    if (touchIcon) {
      return this.resolveUrl(touchIcon, sourceUrl);
    }

    return undefined;
  }

  private extractImagesFromDom(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
  ): WebsiteScrapingResult['images'] {
    const images: WebsiteScrapingResult['images'] = [];
    const seen = new Set<string>();

    const addImage = (
      src: string | undefined,
      alt?: string,
      isSrcSet = false,
    ): void => {
      if (!src || src.startsWith('data:')) {
        return;
      }

      // Only treat the value as a srcset (comma-separated candidate list) when
      // it actually came from a srcset attribute. Plain src/data-src URLs can
      // legitimately contain commas (e.g. CDN transform params) and must not be
      // truncated at the first comma.
      const candidate = isSrcSet ? this.extractSrcFromSrcSet(src) : src;
      const resolved = this.resolveUrl(candidate, sourceUrl);
      if (!resolved || seen.has(resolved)) {
        return;
      }

      seen.add(resolved);
      images.push({
        alt: alt?.trim() || undefined,
        src: resolved,
      });
    };

    $('meta[property="og:image"], meta[name="twitter:image"]').each(
      (_i, el) => {
        addImage($(el).attr('content'), 'Social preview image');
      },
    );

    $('img[src], img[data-src], img[srcset]').each((_i, el) => {
      const direct = $(el).attr('src') ?? $(el).attr('data-src');
      if (direct) {
        addImage(direct, $(el).attr('alt'));
      } else {
        addImage($(el).attr('srcset'), $(el).attr('alt'), true);
      }
    });

    return images.slice(0, MAX_IMAGE_CANDIDATES);
  }

  private extractBannerFromDom(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
    ogImage: string | undefined,
    images: WebsiteScrapingResult['images'],
    logoUrl: string | undefined,
  ): string | undefined {
    const bannerSelectors = [
      'img[class*="hero"]',
      'img[class*="banner"]',
      'img[id*="hero"]',
      'img[id*="banner"]',
      '[class*="hero"] img',
      '[class*="banner"] img',
    ];

    for (const selector of bannerSelectors) {
      const src = $(selector).first().attr('src');
      if (src) {
        return this.resolveUrl(src, sourceUrl);
      }
    }

    if (ogImage) {
      return this.resolveUrl(ogImage, sourceUrl);
    }

    return images.find((image) => image.src !== logoUrl)?.src;
  }

  private extractSrcFromSrcSet(value: string): string {
    return value.split(',')[0]?.trim().split(/\s+/)[0] ?? value;
  }

  /**
   * Resolve a potentially relative URL against a base URL
   */
  private resolveUrl(href: string, base: string): string {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  assertHtmlResponse(response: Response): void {
    const contentType = response.headers.get('content-type');
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new BadRequestException(`Unsupported content type: ${contentType}`);
    }
  }

  /**
   * Extract value propositions from content
   */
  private extractValuePropositions(text: string): string[] {
    const propositions: string[] = [];

    const bulletPatterns = [
      /•\s*([^•\n]+)/g,
      /✓\s*([^✓\n]+)/g,
      /✔\s*([^✔\n]+)/g,
      /-\s*([A-Z][^-\n]+)/g,
    ];

    for (const pattern of bulletPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 10 && match[1].length < 200) {
          propositions.push(match[1].trim());
        }
      }
    }

    return [...new Set(propositions)].slice(0, 6);
  }

  /**
   * Extract about/description text
   */
  private extractAboutText(text: string): string | undefined {
    const aboutPatterns = [
      /about\s+us[\s:]+([^.]+\.)/i,
      /who\s+we\s+are[\s:]+([^.]+\.)/i,
      /our\s+mission[\s:]+([^.]+\.)/i,
      /we\s+are\s+([^.]+\.)/i,
    ];

    for (const pattern of aboutPatterns) {
      const match = text.match(pattern);
      if (match?.[1] && match[1].length > 50) {
        return match[1].trim();
      }
    }

    return undefined;
  }
}
