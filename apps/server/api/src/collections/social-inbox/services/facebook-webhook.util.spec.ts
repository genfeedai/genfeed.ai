import { extractFacebookCommentPageIds } from '@api/collections/social-inbox/services/facebook-webhook.util';
import { describe, expect, it } from 'vitest';

const PAGE_ID = '1010';

function delivery(value: Record<string, unknown>, field = 'feed') {
  return {
    entry: [{ changes: [{ field, value }], id: PAGE_ID, time: 1_700_000_000 }],
    object: 'page',
  };
}

const NEW_COMMENT = {
  comment_id: '1010_55',
  from: { id: '777', name: 'Taylor' },
  item: 'comment',
  post_id: '1010_9',
  verb: 'add',
};

describe('extractFacebookCommentPageIds', () => {
  it('names the Page that received a new comment', () => {
    expect(extractFacebookCommentPageIds(delivery(NEW_COMMENT))).toEqual([
      PAGE_ID,
    ]);
  });

  it.each([
    ['an edited comment', { ...NEW_COMMENT, verb: 'edited' }],
    ['a removed comment', { ...NEW_COMMENT, verb: 'remove' }],
    ['a new post', { ...NEW_COMMENT, item: 'post' }],
    ['a reaction', { ...NEW_COMMENT, item: 'reaction' }],
    [
      'a comment the Page wrote itself',
      { ...NEW_COMMENT, from: { id: PAGE_ID } },
    ],
  ])('ignores %s', (_label, value) => {
    expect(extractFacebookCommentPageIds(delivery(value))).toEqual([]);
  });

  it('ignores a change to another webhook field', () => {
    expect(
      extractFacebookCommentPageIds(delivery(NEW_COMMENT, 'mention')),
    ).toEqual([]);
  });

  it('ignores a delivery for another object', () => {
    expect(
      extractFacebookCommentPageIds({
        ...delivery(NEW_COMMENT),
        object: 'instagram',
      }),
    ).toEqual([]);
  });

  it('names each Page once across entries', () => {
    const body = delivery(NEW_COMMENT);
    body.entry.push({
      changes: [{ field: 'feed', value: NEW_COMMENT }],
      id: '2020',
      time: 1_700_000_001,
    });
    body.entry.push(body.entry[0] as never);

    expect(extractFacebookCommentPageIds(body)).toEqual([PAGE_ID, '2020']);
  });

  it.each([[null], [undefined], ['text'], [{ entry: 'x', object: 'page' }]])(
    'returns nothing for a malformed body %j',
    (payload) => {
      expect(extractFacebookCommentPageIds(payload)).toEqual([]);
    },
  );
});
