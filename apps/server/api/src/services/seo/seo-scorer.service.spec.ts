import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the global PrismaService class so importing the service never tries to
// construct the real (adapter-backed) client. We inject a plain mock anyway.
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import type { ConfigService } from '@api/config/config.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

import { SeoScorerService } from './seo-scorer.service';
import type { SeoScorableContent } from './seo-scorer.types';
import {
  assembleScorecard,
  buildSeoChecks,
  computeKeywordDensity,
  countWords,
  fleschReadingEase,
  splitSentences,
} from './seo-scorer.util';

function check(checks: ReturnType<typeof buildSeoChecks>, id: string) {
  const found = checks.find((c) => c.id === id);
  if (!found) {
    throw new Error(`check ${id} not found`);
  }
  return found;
}

// ─── Pure text helpers ─────────────────────────────────────────────────────

describe('seo-scorer.util text helpers', () => {
  it('countWords counts whitespace-separated tokens', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('  ')).toBe(0);
    expect(countWords('')).toBe(0);
  });

  it('splitSentences splits on terminal punctuation', () => {
    expect(splitSentences('A cat. A dog! A bird?')).toHaveLength(3);
    expect(splitSentences('')).toHaveLength(0);
  });

  it('fleschReadingEase returns a clamped 0-100 score', () => {
    const easy = fleschReadingEase('The cat sat on the mat. The dog ran fast.');
    expect(easy).toBeGreaterThan(60);
    expect(easy).toBeLessThanOrEqual(100);
    expect(fleschReadingEase('')).toBe(0);
  });

  it('computeKeywordDensity returns null without a keyword and a percent with one', () => {
    expect(computeKeywordDensity('any text here', null)).toBeNull();
    const words = `${'word '.repeat(98)}seo seo`.trim();
    expect(computeKeywordDensity(words, 'seo')).toBeCloseTo(2, 1);
  });
});

// ─── Deterministic dimension checks ─────────────────────────────────────────

describe('buildSeoChecks deterministic scoring', () => {
  it('scores title length by band', () => {
    expect(
      check(buildSeoChecks({ title: 'a'.repeat(55) }), 'title_length').points,
    ).toBe(4);
    expect(
      check(buildSeoChecks({ title: 'a'.repeat(40) }), 'title_length').points,
    ).toBe(3);
    expect(check(buildSeoChecks({ title: '' }), 'title_length').points).toBe(0);
  });

  it('scores meta description length by band', () => {
    expect(
      check(buildSeoChecks({ metaDescription: 'm'.repeat(155) }), 'meta_length')
        .points,
    ).toBe(4);
    expect(
      check(buildSeoChecks({ metaDescription: '' }), 'meta_length').points,
    ).toBe(0);
  });

  it('scores slug format', () => {
    expect(
      check(
        buildSeoChecks({ slug: 'best-email-marketing-tools' }),
        'slug_format',
      ).points,
    ).toBe(3);
    expect(
      check(buildSeoChecks({ slug: 'post-12345' }), 'slug_format').points,
    ).toBe(2);
    expect(
      check(buildSeoChecks({ slug: '2026-01-01' }), 'slug_format').points,
    ).toBe(0);
    expect(
      check(buildSeoChecks({ slug: 'Bad_Slug' }), 'slug_format').points,
    ).toBe(0);
  });

  it('rewards a clean heading hierarchy and penalises skips / missing H1', () => {
    expect(
      check(
        buildSeoChecks({ content: '<h1>A</h1><h2>B</h2><h3>C</h3>' }),
        'heading_hierarchy',
      ).points,
    ).toBe(5);
    expect(
      check(
        buildSeoChecks({ content: '<h1>A</h1><h3>C</h3>' }),
        'heading_hierarchy',
      ).points,
    ).toBe(3);
    expect(
      check(
        buildSeoChecks({ content: '<p>no headings</p>' }),
        'heading_hierarchy',
      ).points,
    ).toBe(0);
  });

  it('counts internal links and bullet lists', () => {
    const html =
      '<a href="/a">x</a><a href="/b">y</a><a href="/c">z</a><ul><li>1</li></ul>';
    const checks = buildSeoChecks({ content: html });
    expect(check(checks, 'internal_links').points).toBe(3);
    expect(check(checks, 'lists_used').points).toBe(3);
  });

  it('scores image alt-text coverage', () => {
    const html =
      '<img src="email-funnel.webp" alt="email funnel"/><img src="cta.webp" alt="cta"/>';
    const checks = buildSeoChecks({ content: html });
    expect(check(checks, 'image_alt_text').points).toBe(3);
    expect(check(checks, 'image_compression').points).toBe(2);
  });

  it('penalises keyword stuffing (density > 3%)', () => {
    const stuffed = `<p>${'seo '.repeat(8)}${'word '.repeat(12)}</p>`;
    const c = check(
      buildSeoChecks({ content: stuffed, targetKeyword: 'seo' }),
      'kw_density',
    );
    expect(c.points).toBe(0);
    expect(c.note.toLowerCase()).toContain('stuffing');
  });

  it('treats link-free content and valid #anchor links as non-broken', () => {
    expect(
      check(
        buildSeoChecks({ content: '<p>no links here</p>' }),
        'no_broken_links',
      ).points,
    ).toBe(1);
    const withToc = buildSeoChecks({
      content: '<a href="#intro">Introduction</a><p>body</p>',
    });
    expect(check(withToc, 'no_broken_links').points).toBe(1);
    // In-page anchors are not counted as content internal links.
    expect(check(withToc, 'internal_links').points).toBe(0);
  });

  it('detects JSON-LD schema markup', () => {
    const withSchema = '<script type="application/ld+json">{}</script>';
    expect(
      check(buildSeoChecks({ content: withSchema }), 'schema_markup').points,
    ).toBe(3);
    expect(
      check(buildSeoChecks({ content: '<p>x</p>' }), 'schema_markup').points,
    ).toBe(0);
  });

  it('audits keyword placement when a target keyword is supplied', () => {
    const input: SeoScorableContent = {
      content:
        '<h2>Email Marketing basics</h2><p>Email marketing is a channel.</p>',
      metaDescription: 'A guide to email marketing for teams.',
      slug: 'email-marketing-guide',
      targetKeyword: 'email marketing',
      title: 'The Email Marketing Playbook',
    };
    const checks = buildSeoChecks(input);
    expect(check(checks, 'kw_in_title').points).toBe(4);
    expect(check(checks, 'kw_in_slug').points).toBe(3);
    expect(check(checks, 'kw_in_meta').points).toBe(3);
    expect(check(checks, 'kw_in_h2').points).toBe(3);
  });

  it('marks keyword checks unavailable when no target keyword is given', () => {
    const checks = buildSeoChecks({
      title: 'Some Title',
      content: '<p>Body</p>',
    });
    expect(check(checks, 'kw_in_title').available).toBe(false);
    expect(check(checks, 'kw_in_title').points).toBe(0);
  });

  it('marks head-only signals (canonical, OG, page speed) unavailable', () => {
    const checks = buildSeoChecks({ content: '<p>x</p>' });
    expect(check(checks, 'canonical_tag').available).toBe(false);
    expect(check(checks, 'open_graph').available).toBe(false);
    expect(check(checks, 'page_speed').available).toBe(false);
  });
});

// ─── Assembly ──────────────────────────────────────────────────────────────

describe('assembleScorecard', () => {
  it('aggregates per-dimension breakdown and overall rating', () => {
    const checks = buildSeoChecks({
      content:
        '<h1>Email Marketing</h1><h2>Email Marketing tips</h2><p>Email marketing is great.</p>',
      metaDescription: 'm'.repeat(155),
      slug: 'email-marketing-guide',
      targetKeyword: 'email marketing',
      title: 'a'.repeat(55),
    });
    const card = assembleScorecard(checks, {
      fleschReadingEase: 65,
      keywordDensity: 1.5,
      llmApplied: false,
      scoredAt: '2026-06-26T00:00:00.000Z',
      targetKeyword: 'email marketing',
      wordCount: 5,
    });
    expect(card.score).toBeGreaterThanOrEqual(0);
    expect(card.score).toBeLessThanOrEqual(100);
    const summed = Object.values(card.breakdown).reduce((a, b) => a + b, 0);
    expect(card.score).toBe(summed);
    // Unavailable in this fixture: canonical(2) + OG(2) + mobile(3) +
    // pageSpeed(2) + secondaryKw(2, none given) + https(1, no url) = 12.
    expect(card.meta.maxAvailable).toBe(88);
    expect(['excellent', 'good', 'needs_work', 'poor', 'critical']).toContain(
      card.rating,
    );
  });
});

// ─── Service ───────────────────────────────────────────────────────────────

describe('SeoScorerService', () => {
  let configService: ConfigService;
  let logger: LoggerService;
  let openRouter: { chatCompletion: ReturnType<typeof vi.fn> };
  let prisma: {
    article: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    post: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: SeoScorerService;

  const goodInput: SeoScorableContent = {
    content:
      '<h1>Email Marketing</h1><p>Email marketing helps teams reach inboxes.</p>' +
      '<h2>Email Marketing tactics</h2><ul><li>Segment</li><li>Automate</li></ul>' +
      '<a href="/guide">read the guide</a>',
    metaDescription: 'd'.repeat(155),
    slug: 'email-marketing-guide',
    targetKeyword: 'email marketing',
    title: 'a'.repeat(55),
  };

  beforeEach(() => {
    configService = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    openRouter = { chatCompletion: vi.fn() };
    prisma = {
      article: { findFirst: vi.fn(), update: vi.fn() },
      post: { findFirst: vi.fn(), update: vi.fn() },
    };
    service = new SeoScorerService(
      configService,
      logger,
      prisma as unknown as PrismaService,
      openRouter as unknown as OpenRouterService,
    );
  });

  it('produces a reproducible deterministic score (same input → same number)', async () => {
    const a = await service.scoreContent(goodInput, { useLlm: false });
    const b = await service.scoreContent(goodInput, { useLlm: false });
    expect(a.score).toBe(b.score);
    expect(a.breakdown).toEqual(b.breakdown);
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
    expect(a.meta.llmApplied).toBe(false);
  });

  it('lets the LLM move only the qualitative checks, leaving deterministic ones intact', async () => {
    const baseline = await service.scoreContent(goodInput, { useLlm: false });
    const baselineTitle = baseline.checks.find(
      (c) => c.id === 'title_length',
    )?.points;

    openRouter.chatCompletion.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              activeVoicePoints: 3,
              conclusionCtaPoints: 1,
              faqPoints: 3,
              jargonPoints: 2,
              suggestions: ['Add an author bio for E-E-A-T.'],
            }),
            role: 'assistant',
          },
        },
      ],
    });

    const withLlm = await service.scoreContent(goodInput);
    expect(withLlm.meta.llmApplied).toBe(true);
    expect(withLlm.checks.find((c) => c.id === 'faq_section')?.points).toBe(3);
    expect(withLlm.checks.find((c) => c.id === 'conclusion_cta')?.points).toBe(
      1,
    );
    expect(withLlm.checks.find((c) => c.id === 'title_length')?.points).toBe(
      baselineTitle,
    );
    expect(withLlm.suggestions).toContain('Add an author bio for E-E-A-T.');
  });

  it('falls back to deterministic-only when the LLM call fails', async () => {
    openRouter.chatCompletion.mockRejectedValue(new Error('boom'));
    const result = await service.scoreContent(goodInput);
    expect(result.meta.llmApplied).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('scores and persists an article', async () => {
    prisma.article.findFirst.mockResolvedValue({
      content: goodInput.content,
      excerpt: goodInput.metaDescription,
      id: 'art_1',
      organizationId: 'org_1',
      slug: goodInput.slug,
      title: goodInput.title,
    });
    prisma.article.update.mockResolvedValue({});

    const card = await service.scoreArticle(
      'art_1',
      'org_1',
      'email marketing',
    );

    expect(prisma.article.findFirst).toHaveBeenCalledWith({
      where: { id: 'art_1', isDeleted: false, organizationId: 'org_1' },
    });
    expect(prisma.article.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.article.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({
      id: 'art_1',
      isDeleted: false,
      organizationId: 'org_1',
    });
    expect(typeof updateArg.data.seoScore).toBe('number');
    expect(updateArg.data.seoBreakdown).toBeTruthy();
    expect(card.score).toBe(updateArg.data.seoScore);
  });

  it('throws NotFound when the article is missing', async () => {
    prisma.article.findFirst.mockResolvedValue(null);
    await expect(service.scoreArticle('missing', 'org_1')).rejects.toThrow(
      'Article not found',
    );
  });

  it('scores and persists a post with seoScore + seoBreakdown', async () => {
    prisma.post.findFirst.mockResolvedValue({
      description: '<p>Email marketing is great for reach.</p>',
      id: 'post_1',
      label: 'Email Marketing',
      organizationId: 'org_1',
    });
    prisma.post.update.mockResolvedValue({});

    const card = await service.scorePost('post_1', 'org_1', 'email marketing');
    expect(prisma.post.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.post.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({
      id: 'post_1',
      isDeleted: false,
      organizationId: 'org_1',
    });
    expect(typeof updateArg.data.seoScore).toBe('number');
    expect(updateArg.data.seoBreakdown).toBeTruthy();
    expect(card.score).toBe(updateArg.data.seoScore);
  });

  it('throws NotFound when the post is missing', async () => {
    prisma.post.findFirst.mockResolvedValue(null);
    await expect(service.scorePost('missing', 'org_1')).rejects.toThrow(
      'Post not found',
    );
  });
});
