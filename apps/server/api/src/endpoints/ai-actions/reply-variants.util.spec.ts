import {
  createReplyVariantsGate,
  joinReplyVariants,
  parseReplyVariants,
  splitReplyVariants,
  truncateToChannelLimit,
} from '@api/endpoints/ai-actions/reply-variants.util';
import { describe, expect, it } from 'vitest';

describe('reply variants', () => {
  describe('parseReplyVariants', () => {
    it('splits on separator lines and strips numbering and quotes', () => {
      expect(
        parseReplyVariants(
          '1. "First reply."\n---\n2) Second reply\n  ---  \n- Third one\n\n----\n',
        ),
      ).toEqual(['First reply.', 'Second reply', 'Third one']);
    });

    it('keeps a dash inside a reply and removes post tags', () => {
      expect(parseReplyVariants('Fast - really fast</post>')).toEqual([
        'Fast - really fast',
      ]);
    });

    it('returns nothing for an empty answer', () => {
      expect(parseReplyVariants(' \n---\n ')).toEqual([]);
    });
  });

  it('round-trips the saved artifact', () => {
    const saved = joinReplyVariants(['One', 'Two\nlines', 'Three']);
    expect(saved).toBe('One\n---\nTwo\nlines\n---\nThree');
    expect(splitReplyVariants(saved)).toEqual(['One', 'Two\nlines', 'Three']);
  });

  describe('truncateToChannelLimit', () => {
    it('leaves a reply that fits', () => {
      expect(truncateToChannelLimit('Short reply.', 280, true)).toBe(
        'Short reply.',
      );
    });

    it('cuts at the last sentence that keeps a third of the room', () => {
      const text = 'First sentence is here. Second sentence goes on and on.';
      expect(truncateToChannelLimit(text, 40, false)).toBe(
        'First sentence is here.',
      );
    });

    it('cuts at a word with an ellipsis when no sentence end fits', () => {
      const out = truncateToChannelLimit(
        'one two three four five six seven eight nine ten',
        20,
        false,
      );
      expect(out).toBe('one two three four…');
      expect(out.length).toBeLessThanOrEqual(20);
    });

    it('counts X characters by weight when cutting', () => {
      const out = truncateToChannelLimit(
        '日本語の長い返信です'.repeat(20),
        100,
        true,
      );
      expect(out.endsWith('…')).toBe(true);
      expect(out.length).toBeLessThan(60);
    });

    it('cuts a single oversized word', () => {
      const out = truncateToChannelLimit('x'.repeat(100), 10, false);
      expect(out).toBe(`${'x'.repeat(9)}…`);
    });
  });

  describe('createReplyVariantsGate', () => {
    const gate = (maxVariants = 3) =>
      createReplyVariantsGate({
        maxCharacters: 50,
        maxVariants,
        usesWeightedCharacters: false,
      });

    it('keeps distinct replies in order up to the requested count', () => {
      expect(gate(2).normalize('One\n---\nTwo\n---\nThree')).toBe(
        'One\n---\nTwo',
      );
    });

    it('drops repeats ignoring case and punctuation, and prefixes of a kept reply', () => {
      expect(
        gate().normalize(
          'Nice work!\n---\nnice work\n---\nNice work team\n---\nOther',
        ),
      ).toBe('Nice work!\n---\nOther');
    });

    it('cuts a long reply to the limit', () => {
      const normalized = gate().normalize(`${'word '.repeat(30)}`) as string;
      expect(normalized.length).toBeLessThanOrEqual(50);
      expect(normalized.endsWith('…')).toBe(true);
    });

    it('rejects an answer with no reply and says it was empty', () => {
      const empty = gate();
      expect(empty.normalize('\n---\n  ')).toBeNull();
      expect(empty.rejection()).toBe('empty');
    });
  });
});
