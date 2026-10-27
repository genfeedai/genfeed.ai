import {
  extractPostGenerationLabel,
  parsePostGenerationSlots,
} from '@api/collections/posts/services/post-generation-text.util';

describe('post generation text parsing', () => {
  it('ignores blank line separators without consuming thread positions', () => {
    expect(parsePostGenerationSlots('Reply one\n\nReply two', 2)).toEqual([
      'Reply one',
      'Reply two',
    ]);
  });

  it('keeps each numbered post whole, with its line breaks and without the lead-in', () => {
    expect(
      parsePostGenerationSlots(
        'Here is your thread:\n\n1/ Season it twice.\nWipe, never soak.\n\n2/ Dry it on the hob.\n\n3/ Oil it thin.',
        3,
      ),
    ).toEqual([
      'Season it twice.\nWipe, never soak.',
      'Dry it on the hob.',
      'Oil it thin.',
    ]);
  });

  it('falls back to lines when the numbers do not count up from 1', () => {
    expect(
      parsePostGenerationSlots('Two rules\n1. Season it\n3. Oil it', 2),
    ).toEqual(['Two rules', 'Season it']);
  });

  it('keeps a leading figure instead of stripping it as a number prefix', () => {
    expect(
      parsePostGenerationSlots(
        JSON.stringify([
          '2.5 million pans ship every year.',
          '3-step care: wipe, dry, oil.',
          '10x the lifespan.',
        ]),
        3,
      ),
    ).toEqual([
      '2.5 million pans ship every year.',
      '3-step care: wipe, dry, oil.',
      '10x the lifespan.',
    ]);
  });

  it('extracts a whitespace-normalized label without markup', () => {
    expect(
      extractPostGenerationLabel('<p>Hello <strong>launch</strong></p>'),
    ).toBe('Hello launch');
  });

  it('preserves malformed markup text and caps the label', () => {
    expect(extractPostGenerationLabel('Hello <unfinished')).toBe(
      'Hello <unfinished',
    );
    expect(extractPostGenerationLabel('word '.repeat(20), 20)).toBe(
      'word word word word...',
    );
  });
});
