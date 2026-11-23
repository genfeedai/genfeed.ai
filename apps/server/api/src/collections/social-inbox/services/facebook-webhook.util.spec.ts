import { extractFacebookInboxPageIds } from '@api/collections/social-inbox/services/facebook-webhook.util';
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

describe('extractFacebookInboxPageIds', () => {
  it('names the Page that received a new comment', () => {
    expect(extractFacebookInboxPageIds(delivery(NEW_COMMENT))).toEqual([
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
    expect(extractFacebookInboxPageIds(delivery(value))).toEqual([]);
  });

  it('ignores a change to another webhook field', () => {
    expect(
      extractFacebookInboxPageIds(delivery(NEW_COMMENT, 'mention')),
    ).toEqual([]);
  });

  it('ignores a delivery for another object', () => {
    expect(
      extractFacebookInboxPageIds({
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

    expect(extractFacebookInboxPageIds(body)).toEqual([PAGE_ID, '2020']);
  });

  describe('Messenger messages', () => {
    const message = {
      message: { mid: 'm_1', text: 'Hi' },
      recipient: { id: PAGE_ID },
      sender: { id: '777' },
      timestamp: 1_700_000_000_000,
    };
    const messaging = (event: Record<string, unknown>) => ({
      entry: [{ id: PAGE_ID, messaging: [event], time: 1_700_000_000 }],
      object: 'page',
    });

    it('names the Page that received a message from a person', () => {
      expect(extractFacebookInboxPageIds(messaging(message))).toEqual([
        PAGE_ID,
      ]);
    });

    it.each([
      [
        'an echo of the Page own send',
        { ...message, message: { ...message.message, is_echo: true } },
      ],
      ['a message the Page sent', { ...message, sender: { id: PAGE_ID } }],
      [
        'a delivery receipt',
        { delivery: { mids: ['m_1'] }, sender: { id: '777' } },
      ],
      ['a read receipt', { read: { watermark: 1 }, sender: { id: '777' } }],
    ])('ignores %s', (_label, event) => {
      expect(extractFacebookInboxPageIds(messaging(event))).toEqual([]);
    });

    it('names the Page once when a comment and a message arrive together', () => {
      const body = {
        entry: [
          {
            changes: [{ field: 'feed', value: NEW_COMMENT }],
            id: PAGE_ID,
            messaging: [message],
          },
        ],
        object: 'page',
      };

      expect(extractFacebookInboxPageIds(body)).toEqual([PAGE_ID]);
    });
  });

  it.each([[null], [undefined], ['text'], [{ entry: 'x', object: 'page' }]])(
    'returns nothing for a malformed body %j',
    (payload) => {
      expect(extractFacebookInboxPageIds(payload)).toEqual([]);
    },
  );
});
