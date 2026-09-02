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

  it('preserves the previous single-line style capture semantics', () => {
    expect(
      extractStyleNotes('Create images in a bold\neditorial style'),
    ).toBeUndefined();
    expect(
      extractStyleNotes('in a broken\neditorial style, with a valid style'),
    ).toBe('valid');
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

  it('preserves the previous single-line topic capture semantics', () => {
    expect(
      extractBatchTopic(
        'Create posts about AI\nSafety today',
        'create posts about ai\nsafety today',
      ),
    ).toBeUndefined();
    expect(
      extractBatchTopic(
        'Create posts about AI Safety\nfor LinkedIn',
        'create posts about ai safety\nfor linkedin',
      ),
    ).toBe('AI Safety');
    expect(
      extractBatchTopic('Create posts about AI\n', 'create posts about ai\n'),
    ).toBeUndefined();
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

  it('does not rescan rejected style and topic candidates', () => {
    const repeatedStyleCandidates = 'in a '.repeat(20_000);
    expect(extractStyleNotes(repeatedStyleCandidates)).toBeUndefined();

    const repeatedTopicCandidates = `${'about '.repeat(20_000)}${'x'.repeat(
      50_000,
    )}\ny`;
    expect(
      extractBatchTopic(repeatedTopicCandidates, repeatedTopicCandidates),
    ).toBeUndefined();
  });
  it('does not treat a glued count and asset as a match', () => {
    expect(extractRecurringContentCount('create 5images')).toBeUndefined();
  });

  it('reads a platform-qualified asset count', () => {
    expect(extractRecurringContentCount('create 5 twitter videos')).toBe(5);
  });

  it('ignores a platform token that is not followed by an asset', () => {
    expect(
      extractRecurringContentCount('create 5 twitter weekly'),
    ).toBeUndefined();
  });

  it('extracts style notes after in-an', () => {
    expect(extractStyleNotes('Create images in an editorial style')).toBe(
      'editorial',
    );
  });

  it('returns undefined when a style cue has no notes', () => {
    expect(extractStyleNotes('Create images in a style')).toBeUndefined();
  });

  it('ignores about with no following whitespace', () => {
    expect(
      extractBatchTopic('Create posts about.', 'create posts about.'),
    ).toBeUndefined();
  });

  it.each(['on', 'this', 'next', 'over'])(
    'stops a topic before terminator "%s"',
    (terminator) => {
      expect(
        extractBatchTopic(
          `Create posts about AI Safety ${terminator} Monday`,
          `create posts about ai safety ${terminator} monday`,
        ),
      ).toBe('AI Safety');
    },
  );

  it.each(['!', '?'])('stops a topic at sentence punctuation %s', (mark) => {
    expect(
      extractBatchTopic(
        `Create posts about AI Safety${mark} extra`,
        `create posts about ai safety${mark} extra`,
      ),
    ).toBe('AI Safety');
  });
});
