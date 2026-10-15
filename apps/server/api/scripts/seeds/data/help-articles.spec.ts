import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArticleCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { HELP_ARTICLES } from './help-articles';
import { SEO_ARTICLES } from './seo-articles';

const TITLE_SUFFIX = ' | Genfeed.ai';
const TITLE_MAX_LENGTH = 63;
const DESCRIPTION_MAX_LENGTH = 160;

const REPO_ROOT = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../../..',
);

describe('Cloud help article catalog', () => {
  it('ships eleven uniquely slugged articles in the help category', () => {
    expect(HELP_ARTICLES).toHaveLength(11);
    expect(new Set(HELP_ARTICLES.map(({ slug }) => slug)).size).toBe(11);
    for (const article of HELP_ARTICLES) {
      expect(article.category, article.slug).toBe(ArticleCategory.HELP);
    }
  });

  it('does not collide with the SEO catalog', () => {
    const seoSlugs = new Set(SEO_ARTICLES.map(({ slug }) => slug));
    for (const article of HELP_ARTICLES) {
      expect(seoSlugs.has(article.slug), article.slug).toBe(false);
    }
  });

  it('keeps SEO titles and descriptions inside the search-result budgets', () => {
    for (const article of HELP_ARTICLES) {
      expect(
        `${article.label}${TITLE_SUFFIX}`.length,
        `${article.slug} title`,
      ).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      expect(
        article.summary.length,
        `${article.slug} summary`,
      ).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
      expect(article.summary.length, `${article.slug} summary`).toBeGreaterThan(
        60,
      );
    }
  });

  it('gives every article a distinct ISO release time', () => {
    const times = HELP_ARTICLES.map(({ publishedAt }) => publishedAt);
    expect(new Set(times).size).toBe(times.length);
    for (const publishedAt of times) {
      expect(new Date(publishedAt).toISOString()).toBe(publishedAt);
    }
  });

  it('ships structured HTML that links back to the Cloud help set', () => {
    const slugs = new Set(HELP_ARTICLES.map(({ slug }) => slug));
    for (const article of HELP_ARTICLES) {
      expect(article.content.length, article.slug).toBeGreaterThan(1_500);
      expect(article.content, article.slug).toContain('<h2>');
      expect(article.content, article.slug).toContain('Related help');
      expect(article.content, article.slug).not.toMatch(/<(script|style)\b/i);

      const links = [
        ...article.content.matchAll(
          /https:\/\/genfeed\.ai\/articles\/([a-z0-9-]+)/g,
        ),
      ].map((match) => match[1]);
      for (const slug of links) {
        expect(slugs.has(slug), `${article.slug} links to ${slug}`).toBe(true);
      }
    }
  });

  it('never links to retired docs.genfeed.ai Cloud pages', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.content, article.slug).not.toMatch(
        /docs\.genfeed\.ai\/(cloud|getting-started|advanced\/members-guide|core\/self-hosted-vs-cloud|guides\/self-host-quickstart)/,
      );
    }
  });

  it('uses no fixed prices', () => {
    for (const article of HELP_ARTICLES) {
      const visible = article.content.replace(/<!--[\s\S]*?-->/g, '');
      expect(visible, article.slug).not.toMatch(/\$\d/);
    }
  });

  it('matches the website sitemap fallback list', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'apps/website/packages/data/help-articles.data.ts'),
      'utf8',
    );
    const listed = [...source.matchAll(/^\s+'([a-z0-9-]+)',$/gm)].map(
      (match) => match[1],
    );

    expect(listed.sort()).toEqual(HELP_ARTICLES.map(({ slug }) => slug).sort());
  });
});
