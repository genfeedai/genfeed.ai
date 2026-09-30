import {
  extractPostGenerationLabel,
  parsePostGenerationContent,
  parsePostGenerationSlots,
} from '@api/collections/posts/services/post-generation-text.util';

describe('post generation text parsing', () => {
  it('ignores blank line separators without consuming thread positions', () => {
    expect(parsePostGenerationSlots('Reply one\n\nReply two', 2)).toEqual([
      'Reply one',
      'Reply two',
    ]);
  });

  it('falls back to valid lines when delimiter segments are invalid', () => {
    const firstReply = 'a'.repeat(300);
    const secondReply = 'b'.repeat(300);

    expect(
      parsePostGenerationContent(`${firstReply}\n${secondReply}\n---`, 2),
    ).toEqual([firstReply, secondReply]);
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
