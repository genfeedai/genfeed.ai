import { describe, expect, it } from 'vitest';
import { VoteEntityModel } from '../src/vote.enum';

describe('vote.enum', () => {
  describe('VoteEntityModel', () => {
    it('should have 2 members', () => {
      expect(Object.values(VoteEntityModel)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(VoteEntityModel.INGREDIENT).toBe('Ingredient');
      expect(VoteEntityModel.PROMPT).toBe('Prompt');
    });
  });
});
