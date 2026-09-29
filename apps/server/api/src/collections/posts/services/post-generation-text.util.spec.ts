import {
  extractPostGenerationLabel,
  parsePostGenerationContent,
} from '@api/collections/posts/services/post-generation-text.util';

describe('post generation text parsing', () => {
  it('falls back to valid lines when delimiter segments are invalid', () => {
    const firstReply = 'a'.repeat(300);
    const secondReply = 'b'.repeat(300);

    expect(
      parsePostGenerationContent(`${firstReply}\n${secondReply}\n---`, 2),
    ).toEqual([firstReply, secondReply]);
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
