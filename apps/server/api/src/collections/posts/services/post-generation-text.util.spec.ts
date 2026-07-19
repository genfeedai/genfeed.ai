import {
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
});
