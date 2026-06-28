import { describe, expect, it } from 'vitest';

import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildGeneratedContentJsonLd,
  buildHowToJsonLd,
} from './schema-org.helper';

describe('schema-org helpers', () => {
  it('builds reusable Article JSON-LD for generated content', () => {
    const jsonLd = buildArticleJsonLd({
      author: { name: 'Ada Lovelace', url: 'https://example.com/ada' },
      body: 'Direct answer with supporting evidence.',
      datePublished: '2026-06-28',
      description: 'Citation-ready answer for AI engines.',
      headline: 'How to make content citation-ready',
      imageUrls: ['https://example.com/cover.png'],
      keywords: ['geo', 'structured data'],
      mainEntityUrl: 'https://example.com/articles/geo',
      publisher: {
        logoUrl: 'https://example.com/logo.png',
        name: 'Genfeed',
        url: 'https://genfeed.ai',
      },
      wordCount: 512.8,
    });

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      author: {
        '@type': 'Person',
        name: 'Ada Lovelace',
      },
      headline: 'How to make content citation-ready',
      keywords: 'geo, structured data',
      publisher: {
        '@type': 'Organization',
        logo: {
          '@type': 'ImageObject',
          url: 'https://example.com/logo.png',
        },
      },
      wordCount: 513,
    });
  });

  it('drops empty FAQ rows and emits Question/Answer entities', () => {
    const jsonLd = buildFaqJsonLd({
      items: [
        {
          answer: 'Use concise answer blocks and cite sources.',
          question: 'How do AI engines cite content?',
        },
        { answer: '', question: 'Ignored question' },
      ],
      name: 'GEO FAQ',
    });

    expect(jsonLd.mainEntity).toEqual([
      {
        '@type': 'Question',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Use concise answer blocks and cite sources.',
        },
        name: 'How do AI engines cite content?',
      },
    ]);
  });

  it('builds HowTo steps with stable positions', () => {
    const jsonLd = buildHowToJsonLd({
      name: 'Optimize content for answer engines',
      steps: [
        { text: 'Write a direct answer block.' },
        { name: 'Add schema', text: 'Emit Article, FAQ, or HowTo JSON-LD.' },
      ],
    });

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Optimize content for answer engines',
      step: [
        { '@type': 'HowToStep', name: 'Step 1', position: 1 },
        { '@type': 'HowToStep', name: 'Add schema', position: 2 },
      ],
    });
  });

  it('routes generated content by content type', () => {
    expect(
      buildGeneratedContentJsonLd({
        contentType: 'faq',
        items: [{ answer: 'A', question: 'Q' }],
      })['@type'],
    ).toBe('FAQPage');
  });
});
