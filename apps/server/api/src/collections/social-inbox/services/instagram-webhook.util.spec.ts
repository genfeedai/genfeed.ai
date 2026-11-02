import {
  extractInstagramInboundMessageAccountIds,
  safeEqualStrings,
  verifyMetaWebhookSignature,
} from '@api/collections/social-inbox/services/instagram-webhook.util';
import { describe, expect, it } from 'vitest';

const BODY =
  '{"object":"instagram","entry":[{"id":"1784","messaging":[{"message":{"mid":"m1","text":"hi"}}]}]}';
const SIGNATURE =
  'sha256=df1d857ef310fdd0fedcebb22b0d586c208c301e9cb8d62b432d4a8a6809b65a';

describe('verifyMetaWebhookSignature', () => {
  it.each([
    ['the matching app secret', SIGNATURE, ['app-secret'], true],
    ['either configured secret', SIGNATURE, ['other', 'app-secret'], true],
    ['a different secret', SIGNATURE, ['wrong-secret'], false],
    ['no secrets', SIGNATURE, [], false],
    ['a missing header', undefined, ['app-secret'], false],
    ['a header without the sha256= prefix', 'df1d857e', ['app-secret'], false],
  ])('checks %s', (_label, header, secrets, expected) => {
    expect(verifyMetaWebhookSignature(Buffer.from(BODY), header, secrets)).toBe(
      expected,
    );
  });

  it('rejects a body altered after signing', () => {
    expect(
      verifyMetaWebhookSignature(
        Buffer.from(BODY.replace('hi', 'yo')),
        SIGNATURE,
        ['app-secret'],
      ),
    ).toBe(false);
  });
});

describe('safeEqualStrings', () => {
  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'abcd', false],
    ['', 'abc', false],
  ])('compares %j with %j', (received, expected, result) => {
    expect(safeEqualStrings(received, expected)).toBe(result);
  });
});

describe('extractInstagramInboundMessageAccountIds', () => {
  const delivery = (messaging: unknown[], id = '1784') => ({
    entry: [{ id, messaging }],
    object: 'instagram',
  });

  it.each([
    [
      'a text message',
      delivery([{ message: { mid: 'm1', text: 'hi' } }]),
      ['1784'],
    ],
    [
      'an attachment-only message',
      delivery([{ message: { attachments: [{ type: 'image' }], mid: 'm1' } }]),
      ['1784'],
    ],
    [
      'an echo of our own send',
      delivery([{ message: { is_echo: true, mid: 'm1' } }]),
      [],
    ],
    [
      'a deleted message',
      delivery([{ message: { is_deleted: true, mid: 'm1' } }]),
      [],
    ],
    ['a read receipt', delivery([{ read: { mid: 'm1' } }]), []],
    [
      'a reaction',
      delivery([{ reaction: { action: 'react', mid: 'm1' } }]),
      [],
    ],
    [
      'a Page-object delivery',
      { ...delivery([{ message: { mid: 'm1' } }]), object: 'page' },
      [],
    ],
    ['a body that is not an object', 'nope', []],
    [
      'an entry without messaging',
      { entry: [{ id: '1784' }], object: 'instagram' },
      [],
    ],
  ])('handles %s', (_label, payload, expected) => {
    expect(extractInstagramInboundMessageAccountIds(payload)).toEqual(expected);
  });

  it('returns each account once across entries', () => {
    const payload = {
      entry: [
        { id: '1784', messaging: [{ message: { mid: 'a' } }] },
        { id: '1784', messaging: [{ message: { mid: 'b' } }] },
        { id: '9001', messaging: [{ message: { mid: 'c' } }] },
        { id: '5000', messaging: [{ message: { is_echo: true, mid: 'd' } }] },
      ],
      object: 'instagram',
    };

    expect(extractInstagramInboundMessageAccountIds(payload)).toEqual([
      '1784',
      '9001',
    ]);
  });
});
