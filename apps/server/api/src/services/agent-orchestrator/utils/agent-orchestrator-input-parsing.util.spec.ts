import { describe, expect, it } from 'vitest';
import {
  extractBatchTopic,
  extractRecurringContentCount,
  extractStyleNotes,
} from './agent-orchestrator-input-parsing.util';

describe('agent orchestrator input parsing', () => {
  it.each([
    ['create 5 instagram images every weekday', 5],
    ['create 12 newsletters weekly', 12],
    ['create 3 posts', 3],
  ])('extracts recurring count from "%s"', (content, expected) => {
    expect(extractRecurringContentCount(content)).toBe(expected);
  });

  it('does not join tokens across punctuation or accept three-digit counts', () => {
    expect(extractRecurringContentCount('create 5, images')).toBeUndefined();
    expect(extractRecurringContentCount('create 100 images')).toBeUndefined();
  });

  it('extracts style notes with their original casing', () => {
    expect(
      extractStyleNotes('Create images in a Minimal Beige Luxury style weekly'),
    ).toBe('Minimal Beige Luxury');
    expect(extractStyleNotes('Create images with an editorial style')).toBe(
      'editorial',
    );
    expect(extractStyleNotes('Create images in a bold, editorial style')).toBe(
      'bold, editorial',
    );
  });

  it('extracts a topic before platform, date, or punctuation delimiters', () => {
    expect(
      extractBatchTopic(
        'Create 5 posts about AI Safety for LinkedIn',
        'create 5 posts about ai safety for linkedin',
      ),
    ).toBe('AI Safety');
    expect(
      extractBatchTopic(
        'Create 5 posts about creator tools.',
        'create 5 posts about creator tools.',
      ),
    ).toBe('creator tools');
  });

  it('handles long repeated spaces and words without ambiguous matching', () => {
    const repeated = 'topic '.repeat(20_000);

    expect(
      extractStyleNotes(`create images in a ${repeated}style weekly`),
    ).toBe(repeated.trim());
    expect(
      extractBatchTopic(
        `create posts about ${repeated}for linkedin`,
        `create posts about ${repeated}for linkedin`,
      ),
    ).toBe(repeated.trim());
  });
});
