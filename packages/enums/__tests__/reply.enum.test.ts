import { describe, expect, it } from 'vitest';
import { ReplyLength, ReplyTone } from '../src/reply.enum';

describe('reply.enum', () => {
  describe('ReplyTone', () => {
    it('should have 7 members', () => {
      expect(Object.values(ReplyTone)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(ReplyTone.PROFESSIONAL).toBe('professional');
      expect(ReplyTone.CASUAL).toBe('casual');
      expect(ReplyTone.FRIENDLY).toBe('friendly');
      expect(ReplyTone.HUMOROUS).toBe('humorous');
      expect(ReplyTone.INFORMATIVE).toBe('informative');
      expect(ReplyTone.SUPPORTIVE).toBe('supportive');
      expect(ReplyTone.ENGAGING).toBe('engaging');
    });
  });

  describe('ReplyLength', () => {
    it('should have 3 members', () => {
      expect(Object.values(ReplyLength)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ReplyLength.SHORT).toBe('short');
      expect(ReplyLength.MEDIUM).toBe('medium');
      expect(ReplyLength.LONG).toBe('long');
    });
  });
});
