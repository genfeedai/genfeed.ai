import { PLATFORM_TEMPLATES } from '@api/seeds/platform-template-catalog';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentTemplateKey, PromptTemplateKey } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import Handlebars from 'handlebars';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const prisma = {
    template: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const logger = { error: vi.fn() };
  return {
    logger,
    prisma,
    service: new PlatformTemplateSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('PlatformTemplateSeedService', () => {
  it('creates every catalog template as an active platform prompt', async () => {
    const { prisma, service } = fixture();

    const result = await service.reconcileCatalog();

    expect(result.written).toBe(PLATFORM_TEMPLATES.length);
    expect(result.keys).toEqual(PLATFORM_TEMPLATES.map((t) => t.key));
    for (const [index, template] of PLATFORM_TEMPLATES.entries()) {
      expect(prisma.template.create.mock.calls[index][0].data).toMatchObject({
        config: { content: template.content },
        isActive: true,
        key: template.key,
        label: template.label,
        organizationId: null,
        purpose: 'prompt',
        version: 1,
      });
    }
  });

  it.each([
    [ContentTemplateKey.VIDEO_DEFAULT],
    [ContentTemplateKey.IMAGE_DEFAULT],
    [ContentTemplateKey.MUSIC_DEFAULT],
    [PromptTemplateKey.TEXT_DEFAULT],
  ])(
    'passes the prompt through unescaped for %s so seeding changes no generation',
    (key) => {
      const template = PLATFORM_TEMPLATES.find((t) => t.key === key);

      expect(template?.content).toBe('{{{prompt}}}');
    },
  );

  it('seeds the article brief that article generation looks up', () => {
    const template = PLATFORM_TEMPLATES.find(
      (t) => t.key === PromptTemplateKey.ARTICLE_GENERATE,
    );
    const rendered = Handlebars.compile(template?.content ?? '')({
      category: 'post',
      count: 2,
      keywords: 'AI & content',
      prompt: 'Why "operated content" beats tools',
    });

    expect(rendered).toContain('Write 2 article draft(s)');
    expect(rendered).toContain('Brief: Why "operated content" beats tools');
    expect(rendered).toContain('Category: post');
    expect(rendered).toContain('Keywords to work in naturally: AI & content');
    expect(rendered).toContain('Return exactly 2 item(s) in "articles".');
  });

  it('seeds the X Article brief that X Article generation looks up', () => {
    const template = PLATFORM_TEMPLATES.find(
      (t) => t.key === PromptTemplateKey.X_ARTICLE_GENERATE,
    );
    const rendered = Handlebars.compile(template?.content ?? '')({
      keywords: 'AI, content',
      prompt: 'Why "operated content" beats tools',
      targetWordCount: 1500,
      tone: 'authoritative',
    });

    expect(rendered).toContain('Brief: Why "operated content" beats tools');
    expect(rendered).toContain('Tone: authoritative');
    expect(rendered).toContain('about 1500 words');
    expect(rendered).toContain('Keywords to work in naturally: AI, content');
    expect(rendered).toContain('"sections"');
  });

  it.each([
    [
      PromptTemplateKey.ARTICLE_VIRALITY,
      { category: 'post', content: 'Body', summary: 'Sum', title: 'A "title"' },
      'Title: A "title"',
    ],
    [
      PromptTemplateKey.ARTICLE_VIRALITY,
      { category: 'post', content: 'Body', summary: 'Sum', title: 'T' },
      '"viralityScore"',
    ],
    [
      PromptTemplateKey.ARTICLE_IMAGE_PROMPT,
      { content: 'Body', summary: 'Sum', title: 'A "title"' },
      'Article excerpt:\nBody',
    ],
    [
      PromptTemplateKey.THREAD_EXPAND,
      {
        additionalCount: 3,
        count: 4,
        originalContent: 'Ship "fast"',
        tone: 'casual',
      },
      'into a thread of 4 posts',
    ],
    [
      PromptTemplateKey.THREAD_EXPAND,
      {
        additionalCount: 3,
        count: 4,
        originalContent: 'Ship "fast"',
        tone: 'casual',
      },
      'Ship "fast"',
    ],
    [
      PromptTemplateKey.TWEET_REPLY,
      {
        context: 'Earlier',
        customInstructions: 'Be brief',
        length: 'short',
        tone: 'friendly',
        tweetAuthor: '@ada',
        tweetContent: 'AI & "content"',
      },
      'Post by @ada:\nAI & "content"',
    ],
    [
      PromptTemplateKey.TWEET_REPLY,
      {
        context: 'Earlier',
        customInstructions: 'Be brief',
        length: 'short',
        tone: 'friendly',
        tweetAuthor: '@ada',
        tweetContent: 'Hi',
      },
      'Tone: friendly. Length: short.',
    ],
  ])(
    'renders the %s brief with its variables: %#',
    (key, variables, expected) => {
      const template = PLATFORM_TEMPLATES.find((t) => t.key === key);

      expect(Handlebars.compile(template?.content ?? '')(variables)).toContain(
        expected,
      );
    },
  );

  it('leaves out the optional reply lines when there is no context or instructions', () => {
    const template = PLATFORM_TEMPLATES.find(
      (t) => t.key === PromptTemplateKey.TWEET_REPLY,
    );
    const rendered = Handlebars.compile(template?.content ?? '')({
      context: '',
      customInstructions: '',
      length: 'medium',
      tone: 'casual',
      tweetAuthor: '@ada',
      tweetContent: 'Hello',
    });

    expect(rendered).not.toContain('Conversation so far');
    expect(rendered).not.toContain('Extra instructions');
  });

  it('leaves out the optional lines when there is no category or keywords', () => {
    const template = PLATFORM_TEMPLATES.find(
      (t) => t.key === PromptTemplateKey.ARTICLE_GENERATE,
    );
    const rendered = Handlebars.compile(template?.content ?? '')({
      category: '',
      count: 1,
      keywords: '',
      prompt: 'A brief',
    });

    expect(rendered).not.toContain('Category:');
    expect(rendered).not.toContain('Keywords to work in');
  });

  it('is idempotent: existing keys, including deleted ones, are left alone', async () => {
    const { prisma, service } = fixture();
    prisma.template.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await service.reconcileCatalog();

    expect(result).toEqual({
      keys: [],
      unchanged: PLATFORM_TEMPLATES.length,
      written: 0,
    });
    expect(prisma.template.create).not.toHaveBeenCalled();
    const where = prisma.template.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: null, purpose: 'prompt' });
    expect(where).not.toHaveProperty('isDeleted');
  });

  it('reports what a live run would write without writing on a dry run', async () => {
    const { prisma, service } = fixture();

    const result = await service.reconcileCatalog({ isDryRun: true });

    expect(result.written).toBe(PLATFORM_TEMPLATES.length);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });

  it('attempts every template and names the ones that failed', async () => {
    const { logger, prisma, service } = fixture();
    prisma.template.create
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({});

    await expect(service.reconcileCatalog()).rejects.toThrow(
      `Platform template reconcile failed for: ${PLATFORM_TEMPLATES[0].key}`,
    );
    expect(prisma.template.create).toHaveBeenCalledTimes(
      PLATFORM_TEMPLATES.length,
    );
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
