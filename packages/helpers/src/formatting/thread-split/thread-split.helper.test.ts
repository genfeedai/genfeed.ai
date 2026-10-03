import {
  splitTextIntoThread,
  X_POST_CHAR_LIMIT,
} from '@helpers/formatting/thread-split/thread-split.helper';
import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { describe, expect, it } from 'vitest';

describe('splitTextIntoThread', () => {
  it('returns nothing for blank text', () => {
    expect(splitTextIntoThread('   ')).toEqual([]);
  });

  it('keeps short text as a single item', () => {
    expect(splitTextIntoThread('One short post.')).toEqual(['One short post.']);
  });

  it('packs sentences and never exceeds the limit', () => {
    const sentence = `${'word '.repeat(20).trim()}.`;
    const text = Array.from({ length: 8 }, () => sentence).join(' ');
    const chunks = splitTextIntoThread(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(calculateTweetLength(chunk)).toBeLessThanOrEqual(
        X_POST_CHAR_LIMIT,
      );
    }
  });

  it('cuts an unbroken token that is longer than the limit', () => {
    const chunks = splitTextIntoThread('a'.repeat(600));
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= X_POST_CHAR_LIMIT)).toBe(
      true,
    );
  });

  it('honours a custom limit', () => {
    expect(splitTextIntoThread('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  });
});
