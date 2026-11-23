import {
  articleHtmlToMarkdown,
  buildArticleIndexMarkdown,
  buildArticleMarkdown,
} from '@data/article-markdown';
import { describe, expect, it } from 'vitest';

const BASE = {
  articleUrl: 'https://genfeed.ai/@genfeedai/articles/agents-ship-content',
  brandName: 'Genfeed',
  markdownUrl: 'https://genfeed.ai/@genfeedai/articles/agents-ship-content.md',
  publishedAt: '2026-11-18T09:00:00.000Z',
  summary: 'How agents ship content.',
  title: 'How agents ship content',
};

describe('articleHtmlToMarkdown', () => {
  it('converts headings, emphasis, lists and links', () => {
    expect(
      articleHtmlToMarkdown(
        '<h2>Why</h2><p>Use <strong>agents</strong> and <a href="https://genfeed.ai">Genfeed</a>.</p><ul><li>One</li><li>Two</li></ul>',
      ),
    ).toBe(
      '## Why\n\nUse **agents** and [Genfeed](https://genfeed.ai).\n\n- One\n- Two',
    );
  });

  it('drops scripts so they never become article text', () => {
    const markdown = articleHtmlToMarkdown(
      '<p>Safe</p><script>alert("x")</script>',
    );

    expect(markdown).toBe('Safe');
  });

  it('returns an empty string for empty content', () => {
    expect(articleHtmlToMarkdown('')).toBe('');
    expect(articleHtmlToMarkdown(undefined)).toBe('');
  });
});

describe('buildArticleMarkdown', () => {
  it('opens with the title, summary and an agent brief, then the body', () => {
    expect(
      buildArticleMarkdown({
        ...BASE,
        authorName: 'Vincent',
        contentHtml: '<p>Hello world.</p>',
        tags: ['agents', ' content ', undefined],
        updatedAt: '2026-11-19T10:00:00.000Z',
      }),
    ).toBe(`# How agents ship content

> How agents ship content.

## Agent brief

- **Canonical URL:** https://genfeed.ai/@genfeedai/articles/agents-ship-content
- **Markdown URL:** https://genfeed.ai/@genfeedai/articles/agents-ship-content.md
- **Author:** Vincent
- **Publisher:** Genfeed (https://genfeed.ai)
- **Published:** 2026-11-18
- **Updated:** 2026-11-19
- **Topics:** agents, content
- **Length:** about 2 words
- **Reuse:** quote with attribution and a link to the canonical URL. Not licensed for model training.
- **Cite as:** "How agents ship content", Vincent, Genfeed, Genfeed, 2026-11-18, https://genfeed.ai/@genfeedai/articles/agents-ship-content

## Article

Hello world.
`);
  });

  it('falls back to the brand as author and omits an unchanged update date', () => {
    const markdown = buildArticleMarkdown({
      ...BASE,
      contentHtml: '<p>Body.</p>',
      updatedAt: '2026-11-18T12:00:00.000Z',
    });

    expect(markdown).toContain('- **Author:** Genfeed\n');
    expect(markdown).not.toContain('**Updated:**');
    expect(markdown).toContain(
      '- **Cite as:** "How agents ship content", Genfeed, Genfeed, 2026-11-18,',
    );
  });

  it('marks a paid article as preview only', () => {
    expect(
      buildArticleMarkdown({
        ...BASE,
        contentHtml: '<p>Teaser.</p>',
        isPaid: true,
      }),
    ).toContain(
      '- **Access:** paid article. This is the public preview; the full text is for readers with access.',
    );
  });

  it('keeps a multi-line title on one line and says when there is no text', () => {
    const markdown = buildArticleMarkdown({
      ...BASE,
      contentHtml: '',
      title: 'Line one\n## injected heading',
    });

    expect(markdown.startsWith('# Line one ## injected heading\n')).toBe(true);
    expect(markdown).toContain('_This article has no public text yet._');
  });
});

describe('buildArticleIndexMarkdown', () => {
  it('lists each article with its Markdown link, date and summary', () => {
    expect(
      buildArticleIndexMarkdown([
        {
          markdownUrl: 'https://genfeed.ai/@genfeedai/articles/a.md',
          publishedAt: '2026-11-18T09:00:00.000Z',
          summary: 'First.',
          title: 'A',
        },
        {
          markdownUrl: 'https://genfeed.ai/@genfeedai/articles/b.md',
          title: 'B',
        },
      ]),
    ).toContain(
      '- [A](https://genfeed.ai/@genfeedai/articles/a.md): 2026-11-18 · First.\n- [B](https://genfeed.ai/@genfeedai/articles/b.md)\n',
    );
  });

  it('says when there are no articles', () => {
    expect(buildArticleIndexMarkdown([])).toContain(
      '_No public articles yet._',
    );
  });
});
