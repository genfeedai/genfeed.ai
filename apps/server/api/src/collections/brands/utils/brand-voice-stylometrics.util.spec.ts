import {
  computeVoiceStylometrics,
  deriveVoiceWritingRules,
  formatStylometricsForPrompt,
  median,
  normalizeVoiceText,
  percentile,
  stripLeadingMentions,
} from '@api/collections/brands/utils/brand-voice-stylometrics.util';
import type {
  BrandVoiceSampleKind,
  IBrandVoiceSample,
} from '@genfeedai/contracts/interfaces';

function sample(
  text: string,
  kind: BrandVoiceSampleKind = 'original',
  index = 0,
): IBrandVoiceSample {
  return {
    id: `s-${index}`,
    kind,
    origin: 'own-account',
    platform: 'twitter',
    publishedAt: '2026-09-01T00:00:00.000Z',
    text,
  };
}

function samples(
  texts: string[],
  kind: BrandVoiceSampleKind = 'original',
): IBrandVoiceSample[] {
  return texts.map((text, index) => sample(text, kind, index));
}

describe('brand voice stylometrics', () => {
  describe('helpers', () => {
    it('computes nearest-rank percentiles and integer medians', () => {
      expect(percentile([10, 20, 30, 40], 0.25)).toBe(10);
      expect(percentile([10, 20, 30, 40], 0.9)).toBe(40);
      expect(percentile([], 0.5)).toBe(0);
      expect(median([3, 1, 2])).toBe(2);
      expect(median([1, 2, 3, 4])).toBe(3);
      expect(median([])).toBe(0);
    });

    it('strips reply mentions and normalizes for matching', () => {
      expect(stripLeadingMentions('@alice @bob yeah exactly')).toBe(
        'yeah exactly',
      );
      expect(normalizeVoiceText('@alice  Ship It https://x.co/abc ’now’')).toBe(
        "ship it 'now'",
      );
    });
  });

  it('measures length, casing, punctuation, and markup habits', () => {
    const metrics = computeVoiceStylometrics([
      sample('@someone nah this is wrong', 'reply', 1),
      sample('@someone lol yes', 'reply', 2),
      sample('We shipped the new editor today.', 'original', 3),
      sample('big week — more soon... #launch 🚀', 'original', 4),
      sample('Is this thing on?\nhello!', 'original', 5),
    ]);

    expect(metrics.sampleCount).toBe(5);
    // Reply mentions are excluded from every measurement.
    expect(metrics.replies).toEqual({
      count: 2,
      lowercaseStartShare: 1,
      medianChars: 12,
      p90Chars: 17,
    });
    expect(metrics.originals.count).toBe(3);
    expect(metrics.length.medianChars).toBe(24);
    expect(metrics.lowercaseStartShare).toBe(0.6);
    expect(metrics.emDashShare).toBe(0.2);
    expect(metrics.ellipsisShare).toBe(0.2);
    expect(metrics.exclamationShare).toBe(0.2);
    expect(metrics.questionShare).toBe(0.2);
    expect(metrics.lineBreakShare).toBe(0.2);
    expect(metrics.hashtagSampleShare).toBe(0.2);
    expect(metrics.hashtagPerSample).toBe(0.2);
    expect(metrics.emojiSampleShare).toBe(0.2);
    expect(metrics.endsWithPeriodShare).toBe(0.2);
    expect(metrics.mentionSampleShare).toBe(0);
    expect(metrics.disagreement).toEqual({
      count: 1,
      openers: [{ count: 1, phrase: 'nah' }],
      share: 0.2,
    });
  });

  it('counts ALL-CAPS words and ignores short acronyms', () => {
    const metrics = computeVoiceStylometrics(
      samples(['this is HUGE news', 'AI is fine here']),
    );

    // "this", "HUGE", "news", "fine", "here" are the cased 3+ letter words.
    expect(metrics.allCapsWordShare).toBe(0.2);
  });

  it('finds recurring openers and phrases deterministically', () => {
    const texts = [
      'honestly the best part is shipping',
      'honestly the best part is the team',
      'honestly no idea',
      'ship small, ship often',
      'ship small and learn',
    ];
    const first = computeVoiceStylometrics(samples(texts));
    const second = computeVoiceStylometrics(samples([...texts].reverse()));

    expect(first.topOpeners[0]).toEqual({
      count: 2,
      phrase: 'honestly the best',
    });
    expect(first.topOpeners).toContainEqual({ count: 2, phrase: 'ship small' });
    expect(first.recurringPhrases).toContainEqual({
      count: 2,
      phrase: 'ship small',
    });
    expect(second.topOpeners).toEqual(first.topOpeners);
    expect(second.recurringPhrases).toEqual(first.recurringPhrases);
  });

  it('flags disagreement openers only at the start of a post', () => {
    const metrics = computeVoiceStylometrics(
      samples([
        'hot take: tests are docs',
        'imo this is fine',
        'Nope.',
        'nothing to see here',
        'I said no to that',
      ]),
    );

    expect(metrics.disagreement.count).toBe(3);
    expect(metrics.disagreement.openers.map((entry) => entry.phrase)).toEqual([
      'hot take',
      'imo',
      'nope',
    ]);
  });

  describe('deriveVoiceWritingRules', () => {
    const casualReplies = Array.from(
      { length: 8 },
      (_, index) => `yeah that tracks ${index}`,
    );
    const casualOriginals = [
      'shipped the thing today',
      'nah we are not doing that',
      'nah the old way was fine',
      'small teams win',
    ];

    it('returns nothing for corpora too small to measure', () => {
      expect(
        deriveVoiceWritingRules(
          computeVoiceStylometrics(samples(casualOriginals)),
        ),
      ).toEqual([]);
    });

    it('turns clear habits into concrete rules', () => {
      const metrics = computeVoiceStylometrics([
        ...samples(casualReplies, 'reply'),
        ...casualOriginals.map((text, index) =>
          sample(text, 'original', 100 + index),
        ),
      ]);
      const rules = deriveVoiceWritingRules(metrics);

      expect(rules).toEqual(
        expect.arrayContaining([
          `Keep replies short: typically ~${metrics.replies.medianChars} characters and rarely over ${metrics.replies.p90Chars}`,
          'Start in lowercase (100% of real posts do)',
          'Usually leave off the final period',
          'Do not use emojis',
          'Do not use hashtags',
          'Never use em dashes',
          'Avoid exclamation marks',
          'Write as a single block with no line breaks',
          'When disagreeing, open bluntly the way they do: "nah"',
        ]),
      );
      expect(deriveVoiceWritingRules(metrics)).toEqual(rules);
    });

    it('renders the measurements as prompt evidence', () => {
      const metrics = computeVoiceStylometrics(
        samples(['hello there friend', 'hello there again']),
      );

      const text = formatStylometricsForPrompt(metrics);

      expect(text).toContain(
        '- Samples measured: 2 (0 replies, 2 original posts)',
      );
      expect(text).toContain('"hello there" (2)');
    });
  });
});
