import { describe, expect, it, vi } from 'vitest';
import {
  clipHighlightDetectionSchema,
  createLenientClipHighlightDetectionSchema,
} from '../../src/api-types/contracts/clip-highlight-detection.contract';
import { createLenientPromptOptimizationSchema } from '../../src/api-types/contracts/prompt-optimization.contract';
import { createLenientTrendContentIdeasSchema } from '../../src/api-types/contracts/trend-content-ideas.contract';

const clip = (overrides: Record<string, unknown> = {}) => ({
  start_time: 0,
  end_time: 30,
  title: 'Good clip',
  summary: 'S',
  virality_score: 80,
  tags: ['a'],
  clip_type: 'hook',
  ...overrides,
});

describe('lenient clip highlights', () => {
  it('keeps valid clips, truncates long titles and drops bad durations', () => {
    const onDropped = vi.fn();
    const schema = createLenientClipHighlightDetectionSchema(onDropped);
    const result = schema.safeParse({
      highlights: [
        clip(),
        clip({ title: 'x'.repeat(61) }),
        clip({ end_time: 5 }),
        clip({ virality_score: 'high' }),
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.highlights).toHaveLength(2);
    expect(result.data.highlights[1].title).toHaveLength(60);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(
      onDropped.mock.calls[0][0].map((d: { index: number }) => d.index),
    ).toEqual([2, 3]);
  });
  it('fails when every clip is invalid', () => {
    expect(
      createLenientClipHighlightDetectionSchema().safeParse({
        highlights: [clip({ end_time: 5 }), clip({ summary: '' })],
      }).success,
    ).toBe(false);
  });
  it('fails on an invalid envelope', () => {
    const schema = createLenientClipHighlightDetectionSchema();
    expect(schema.safeParse({ highlights: [clip()], extra: 1 }).success).toBe(
      false,
    );
    expect(schema.safeParse({ highlights: 'nope' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
  it('still accepts an empty list', () => {
    expect(
      createLenientClipHighlightDetectionSchema().safeParse({ highlights: [] })
        .success,
    ).toBe(true);
  });
  it('keeps the strict item schema in the emitted JSON schema', async () => {
    const { z } = await import('zod');
    const lenient = z.toJSONSchema(
      createLenientClipHighlightDetectionSchema(),
      {
        io: 'output',
        unrepresentable: 'any',
      },
    ) as { properties: { highlights: { items?: { properties?: object } } } };
    const strict = z.toJSONSchema(clipHighlightDetectionSchema, {
      io: 'output',
      unrepresentable: 'any',
    }) as { properties: { highlights: { items?: { properties?: object } } } };
    expect(lenient.properties.highlights.items?.properties).toEqual(
      strict.properties.highlights.items?.properties,
    );
  });
});

describe('lenient trend ideas', () => {
  const idea = { title: 'T', description: 'D', contentType: 'video' };
  it('keeps valid ideas and drops invalid ones', () => {
    const onDropped = vi.fn();
    const result = createLenientTrendContentIdeasSchema(onDropped).safeParse({
      ideas: [idea, { ...idea, contentType: 'podcast' }, idea],
    });
    expect(result.success && result.data.ideas).toHaveLength(2);
    expect(onDropped).toHaveBeenCalledTimes(1);
  });
  it('fails when all ideas are invalid or the envelope is bad', () => {
    const schema = createLenientTrendContentIdeasSchema();
    expect(schema.safeParse({ ideas: [{ title: '' }] }).success).toBe(false);
    expect(schema.safeParse({ ideas: [idea], extra: 1 }).success).toBe(false);
  });
});

describe('lenient prompt optimization', () => {
  const base = { optimizedPrompt: 'P', reasoning: 'R', confidenceScore: 0.5 };
  it('drops blank suggestions but keeps the rest', () => {
    const result = createLenientPromptOptimizationSchema().safeParse({
      ...base,
      suggestions: ['a', ' ', 'b'],
    });
    expect(result.success && result.data.suggestions).toEqual(['a', 'b']);
  });
  it('fails when all suggestions are blank or a scalar is invalid', () => {
    const schema = createLenientPromptOptimizationSchema();
    expect(schema.safeParse({ ...base, suggestions: [' '] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ ...base, confidenceScore: 2, suggestions: ['a'] })
        .success,
    ).toBe(false);
  });
});
