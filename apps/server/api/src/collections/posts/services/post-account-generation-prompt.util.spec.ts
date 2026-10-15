import {
  acceptsAccountText,
  buildAccountPostPrompt,
  buildAccountThreadPrompt,
  splitThreadText,
  withRunContext,
} from '@api/collections/posts/services/post-account-generation-prompt.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const input = {
  context: {
    account: { platform: CredentialPlatform.TWITTER },
    constraints: { notes: ['Weighted limit'] },
    promptHints: ['Account: Acct'],
  },
  count: 3,
  limit: 280,
  tone: 'casual',
  topic: 'AI',
} as unknown as Parameters<typeof buildAccountPostPrompt>[0];

describe('account generation prompts', () => {
  it('asks for one distinct post per dispatch', () => {
    const prompt = buildAccountPostPrompt({ ...input, index: 1 });

    expect(prompt).toContain('post 2 of 3');
    expect(prompt).toContain('at most 280 characters');
    expect(prompt).toContain('Topic: AI');
    expect(prompt).toContain('- Account: Acct');
    expect(prompt).toContain('- Weighted limit');
  });

  it('asks for the whole thread in one blank-line separated answer', () => {
    const prompt = buildAccountThreadPrompt(input);

    expect(prompt).toContain('thread of exactly 3 posts');
    expect(prompt).toContain('Separate the posts with one blank line');
  });

  it('adds only the most recent, truncated run output as context', () => {
    const previous = Array.from({ length: 20 }, (_, index) =>
      `${index}`.padEnd(400, 'x'),
    );

    const prompt = withRunContext('Base', previous);

    expect(prompt.startsWith('Base')).toBe(true);
    expect(prompt).toContain('Already written in this run');
    expect(prompt).not.toContain('"0xxx');
    expect(prompt).toContain('"19xxx');
    expect(prompt).not.toContain('x'.repeat(300));
    expect(withRunContext('Base', [])).toBe('Base');
  });

  it('splits a thread on blank lines and drops empty parts', () => {
    expect(splitThreadText('One\n\n\nTwo\n\n  \n\nThree\n')).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  describe('acceptsAccountText', () => {
    const options = {
      count: 2,
      isThread: false,
      limit: 20,
      usesWeightedCharacters: false,
    };

    it('accepts a single post within the limit and rejects overflow or blank text', () => {
      expect(acceptsAccountText('short post', options)).toBe(true);
      expect(acceptsAccountText('x'.repeat(21), options)).toBe(false);
      expect(acceptsAccountText('   ', options)).toBe(false);
    });

    it('accepts a thread of exactly the requested posts, each within the limit', () => {
      const thread = { ...options, isThread: true };

      expect(acceptsAccountText('One\n\nTwo', thread)).toBe(true);
      expect(acceptsAccountText('One', thread)).toBe(false);
      expect(acceptsAccountText('One\n\nTwo\n\nThree', thread)).toBe(false);
      expect(acceptsAccountText(`One\n\n${'x'.repeat(21)}`, thread)).toBe(
        false,
      );
    });
  });
});
