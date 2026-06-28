import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentGeoOptimizerHandler', () => {
  let handler: ContentGeoOptimizerHandler;

  const mockLlmDispatcherService = {
    chatCompletion: vi.fn(),
  };

  const mockLoggerService = {
    warn: vi.fn(),
  };

  const baseContext = {
    brandId: 'brand-id',
    brandVoice: 'Evidence-led and plainspoken',
    organizationId: 'org-id',
    platforms: ['blog'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentGeoOptimizerHandler,
        { provide: LlmDispatcherService, useValue: mockLlmDispatcherService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    handler = module.get(ContentGeoOptimizerHandler);
  });

  it('returns a GEO scorecard and FAQ JSON-LD with LLM rewrite output', async () => {
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              rewrittenContent:
                '## Direct answer\n\nGEO-ready content gives answer engines short, source-backed answer blocks.',
              suggestions: ['Add author credentials.'],
            }),
            role: 'assistant',
          },
        },
      ],
    });

    const result = await handler.execute(baseContext, {
      content:
        '## How does GEO work?\n\nGEO-ready content gives answer engines concise answers in 2026. https://example.com/source',
      faq: [
        {
          answer: 'Use concise answer blocks and source URLs.',
          question: 'How do I optimize for answer engines?',
        },
      ],
      sources: ['https://example.com/source'],
      title: 'GEO Optimization Guide',
      url: 'https://example.com/geo',
    });

    expect(result.skillSlug).toBe('content-geo-optimizer');
    expect(result.type).toBe('text');
    expect(result.content).toContain('## Direct answer');
    expect(result.metadata.llmApplied).toBe(true);
    expect(result.metadata.schemaType).toBe('FAQPage');
    expect(result.metadata.geoScorecard).toMatchObject({
      rating: expect.any(String),
      score: expect.any(Number),
    });
    expect(result.metadata.jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        expect.objectContaining({
          '@type': 'Question',
          name: 'How do I optimize for answer engines?',
        }),
      ],
    });
  });

  it('falls back deterministically and emits Article JSON-LD when the LLM fails', async () => {
    mockLlmDispatcherService.chatCompletion.mockRejectedValue(
      new Error('provider unavailable'),
    );

    const result = await handler.execute(baseContext, {
      authorName: 'Genfeed',
      content: 'GEO content should answer the user clearly. It needs sources.',
      datePublished: '2026-06-28',
      title: 'GEO Content',
    });

    expect(result.content).toContain('## Direct answer: GEO Content');
    expect(result.metadata.llmApplied).toBe(false);
    expect(result.metadata.schemaType).toBe('Article');
    expect(result.metadata.jsonLd).toMatchObject({
      '@type': 'Article',
      author: { '@type': 'Person', name: 'Genfeed' },
      headline: 'GEO Content',
    });
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'content-geo-optimizer LLM call failed, using fallback',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('emits HowTo JSON-LD for step-based GEO output', async () => {
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: '{}', role: 'assistant' } }],
    });

    const result = await handler.execute(baseContext, {
      content: 'Step-by-step answer engine optimization.',
      steps: ['Write a direct answer.', 'Add JSON-LD.'],
      title: 'Optimize for answer engines',
    });

    expect(result.metadata.schemaType).toBe('HowTo');
    expect(result.metadata.jsonLd).toMatchObject({
      '@type': 'HowTo',
      step: [
        expect.objectContaining({
          position: 1,
          text: 'Write a direct answer.',
        }),
        expect.objectContaining({ position: 2, text: 'Add JSON-LD.' }),
      ],
    });
  });

  it('requires source content', async () => {
    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      'content-geo-optimizer requires content',
    );
  });
});
