import {
  parseAddFirstCommentInput,
  parseAddThreadPostsInput,
  parseDraftThreadInput,
  planThreadReplies,
  supportsFirstComment,
} from '@api/services/agent-orchestrator/tools/agent-thread-tool.util';
import { describe, expect, it } from 'vitest';

describe('parseDraftThreadInput', () => {
  it('accepts a post id, a 2-5 count and a known tone', () => {
    expect(
      parseDraftThreadInput({ count: 3, postId: 'p1', tone: 'casual' }),
    ).toEqual({ count: 3, postId: 'p1', tone: 'casual' });
  });

  it.each([
    [{ count: 3 }, 'postId'],
    [{ count: 1, postId: 'p1' }, '2 to 5'],
    [{ count: 6, postId: 'p1' }, '2 to 5'],
    [{ count: 2.5, postId: 'p1' }, 'whole number'],
    [{ count: '3', postId: 'p1' }, 'whole number'],
    [{ count: 3, postId: 'p1', tone: 'angry' }, 'tone'],
  ])('rejects %j', (params, message) => {
    expect(parseDraftThreadInput(params)).toEqual({
      error: expect.stringContaining(message),
    });
  });
});

describe('parseAddThreadPostsInput', () => {
  it('trims replies and prefixes a bare grok question', () => {
    expect(
      parseAddThreadPostsInput({
        grokQuestion: 'is this accurate?',
        postId: 'p1',
        posts: ['  One  ', 'Two'],
      }),
    ).toEqual({
      grokQuestion: '@grok is this accurate?',
      postId: 'p1',
      posts: ['One', 'Two'],
    });
  });

  it('keeps a grok question that already starts with @grok', () => {
    expect(
      parseAddThreadPostsInput({
        grokQuestion: '@grok thoughts?',
        postId: 'p1',
        posts: ['One'],
      }),
    ).toMatchObject({ grokQuestion: '@grok thoughts?' });
  });

  it('rejects a reply over 280 weighted characters', () => {
    expect(
      parseAddThreadPostsInput({ postId: 'p1', posts: ['a'.repeat(281)] }),
    ).toEqual({ error: expect.stringContaining('posts[0]') });
  });

  it('counts emoji and CJK characters as double weight', () => {
    expect(
      parseAddThreadPostsInput({ postId: 'p1', posts: ['漢'.repeat(141)] }),
    ).toEqual({ error: expect.stringContaining('280 weighted') });
    expect(
      parseAddThreadPostsInput({ postId: 'p1', posts: ['漢'.repeat(140)] }),
    ).toMatchObject({ postId: 'p1' });
  });

  it('refuses a reply that would be mistaken for the closing @grok post', () => {
    expect(
      parseAddThreadPostsInput({ postId: 'p1', posts: ['@grok hi'] }),
    ).toEqual({ error: expect.stringContaining('grokQuestion') });
  });

  it.each([
    [{ postId: 'p1' }],
    [{ postId: 'p1', posts: [] }],
    [{ postId: 'p1', posts: ['ok', ' '] }],
    [{ posts: ['ok'] }],
    [{ postId: 'p1', posts: Array.from({ length: 11 }, () => 'x') }],
  ])('rejects %j', (params) => {
    expect(parseAddThreadPostsInput(params)).toHaveProperty('error');
  });

  it('rejects an over-long grok question', () => {
    expect(
      parseAddThreadPostsInput({
        grokQuestion: 'x'.repeat(300),
        postId: 'p1',
        posts: ['One'],
      }),
    ).toEqual({ error: expect.stringContaining('grokQuestion') });
  });
});

describe('parseAddFirstCommentInput', () => {
  it('requires post and comment text', () => {
    expect(
      parseAddFirstCommentInput({ comment: ' hi ', postId: 'p1' }),
    ).toEqual({ comment: 'hi', postId: 'p1' });
    expect(parseAddFirstCommentInput({ postId: 'p1' })).toHaveProperty('error');
    expect(parseAddFirstCommentInput({ comment: 'hi' })).toHaveProperty(
      'error',
    );
  });
});

describe('supportsFirstComment', () => {
  it.each(['youtube', 'instagram', 'linkedin', 'facebook', 'reddit'])(
    'allows %s',
    (platform) => {
      expect(supportsFirstComment(platform)).toBe(true);
    },
  );

  it.each(['twitter', 'tiktok', undefined])('refuses %s', (platform) => {
    expect(supportsFirstComment(platform)).toBe(false);
  });
});

describe('planThreadReplies', () => {
  const child = (id: string, order: number, description: string) => ({
    description,
    id,
    order,
  });

  it('appends replies after the existing children', () => {
    const plan = planThreadReplies([child('c1', 1, 'Existing')], ['A', 'B']);
    expect(plan.toCreate).toEqual([
      { description: 'A', order: 2 },
      { description: 'B', order: 3 },
    ]);
    expect(plan.grokChild).toBeNull();
  });

  it('inserts replies before a closing @grok post, which moves last', () => {
    const plan = planThreadReplies(
      [child('c1', 1, 'Existing'), child('g', 2, '@grok thoughts?')],
      ['A', 'B'],
    );
    expect(plan.toCreate).toEqual([
      { description: 'A', order: 2 },
      { description: 'B', order: 3 },
    ]);
    expect(plan.grokChild?.id).toBe('g');
    expect(plan.firstOrder + plan.toCreate.length).toBe(4);
  });

  it('orders children by their order, not by array position', () => {
    const plan = planThreadReplies(
      [child('g', 3, '@grok?'), child('c2', 2, 'Two'), child('c1', 1, 'One')],
      ['A'],
    );
    expect(plan.grokChild?.id).toBe('g');
    expect(plan.toCreate).toEqual([{ description: 'A', order: 3 }]);
  });

  it('treats an @grok post that is not last as an ordinary reply', () => {
    const plan = planThreadReplies(
      [child('g', 1, '@grok?'), child('c2', 2, 'Two')],
      ['A'],
    );
    expect(plan.grokChild).toBeNull();
    expect(plan.toCreate).toEqual([{ description: 'A', order: 3 }]);
  });

  it('skips replies that are already saved, so a retry never duplicates them', () => {
    const plan = planThreadReplies(
      [child('c1', 1, 'A'), child('c2', 2, 'B'), child('g', 3, '@grok?')],
      ['A', 'B', 'C'],
    );
    expect(plan.alreadySaved).toEqual(['A', 'B']);
    expect(plan.toCreate).toEqual([{ description: 'C', order: 3 }]);
  });

  it('matches a repeated text once per saved copy', () => {
    const plan = planThreadReplies([child('c1', 1, 'Same')], ['Same', 'Same']);
    expect(plan.alreadySaved).toEqual(['Same']);
    expect(plan.toCreate).toEqual([{ description: 'Same', order: 2 }]);
  });

  it('plans a closing grok post only when it is new or changed', () => {
    expect(planThreadReplies([], ['A'], '@grok q?').grokDescription).toBe(
      '@grok q?',
    );
    expect(
      planThreadReplies([child('g', 1, '@grok q?')], ['A'], '@grok q?')
        .grokDescription,
    ).toBeUndefined();
    expect(
      planThreadReplies([child('g', 1, '@grok q?')], ['A'], '@grok new?')
        .grokDescription,
    ).toBe('@grok new?');
  });
});
