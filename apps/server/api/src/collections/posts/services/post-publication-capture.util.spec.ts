import { readFileSync } from 'node:fs';
import {
  extensionPublicationAnalyticsAvailability,
  extensionPublicationAuthorMatchesCredential,
  extensionPublicationCaptureResult,
  extensionPublicationObservedAuthor,
  normalizeExtensionPublication,
  parseExtensionPublicationCaptureInput,
} from '@api/collections/posts/services/post-publication-capture.util';
import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationPlatform,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';

const input: ExtensionPublicationCaptureInput = {
  brandId: 'brand-1',
  platform: 'twitter',
  publicationKind: 'post',
  description: '',
  publicationDate: '2026-01-01T00:00:00.000Z',
  url: 'https://x.com/alice/status/123',
};
const parents: Record<ExtensionPublicationPlatform, string> = {
  twitter: 'https://twitter.com/alice/status/123',
  linkedin: 'https://linkedin.com/feed/update/urn:li:activity:123',
  reddit: 'https://reddit.com/r/example/comments/abc/title',
  youtube: 'https://youtube.com/watch?v=abc',
  instagram: 'https://instagram.com/p/abc',
  facebook: 'https://facebook.com/alice/posts/123',
  tiktok: 'https://tiktok.com/@alice/video/123',
};

describe('reported publication input', () => {
  it('permits media-only content and an old queued observation without a past-age cutoff', () => {
    expect(parseExtensionPublicationCaptureInput(input)).toEqual(input);
  });
  it.each([
    'organizationId',
    'userId',
    'credentialId',
    'source',
    'status',
    'approval',
    'receipt',
    'confirmed',
  ])('rejects privileged field %s', (field) => {
    expect(() =>
      parseExtensionPublicationCaptureInput({ ...input, [field]: 'forged' }),
    ).toThrow();
  });
  it.each([
    { brandId: 1 },
    { platform: 'mastodon' },
    { description: null },
    { description: 'x'.repeat(1048577) },
    { url: 'x'.repeat(2049) },
    { externalId: 'x'.repeat(257) },
    { externalId: '' },
    { author: { externalId: 1 } },
    { author: { handle: 'x'.repeat(257) } },
    { author: { credentialId: 'forged' } },
    { publicationDate: 'not-a-date' },
    { publicationDate: '2026-01-01' },
    { publicationDate: new Date(Date.now() + 6 * 60 * 1000).toISOString() },
    { url: undefined },
    { url: undefined, contextUrl: parents.twitter },
    { url: undefined, publicationKind: 'reply', contextUrl: parents.twitter },
    { contextUrl: parents.twitter },
  ])('rejects malformed input: %j', (patch) => {
    expect(() =>
      parseExtensionPublicationCaptureInput({ ...input, ...patch }),
    ).toThrow();
  });
  it('preserves complete long text and the exact UTF-8 resource bound', () => {
    for (const description of [
      'x'.repeat(20001),
      'x'.repeat(1048576),
      'é'.repeat(524288),
    ]) {
      expect(
        parseExtensionPublicationCaptureInput({ ...input, description })
          .description,
      ).toBe(description);
    }
    expect(() =>
      parseExtensionPublicationCaptureInput({
        ...input,
        description: `${'é'.repeat(524288)}a`,
      }),
    ).toThrow(
      'This publication is too large to record automatically. Its full text was not saved.',
    );
  });
  it.each(['public', 'private', 'unlisted', 'unknown'] as const)(
    'accepts reported audience %s',
    (observedVisibility) => {
      expect(
        parseExtensionPublicationCaptureInput({ ...input, observedVisibility })
          .observedVisibility,
      ).toBe(observedVisibility);
    },
  );
  it('rejects unknown audience enum values', () => {
    expect(() =>
      parseExtensionPublicationCaptureInput({
        ...input,
        observedVisibility: 'friends',
      }),
    ).toThrow();
  });
  it('accepts exactly the context-only reply form', () => {
    expect(
      parseExtensionPublicationCaptureInput({
        ...input,
        url: undefined,
        publicationKind: 'reply',
        contextUrl: parents.twitter,
        externalId: '456',
      }),
    ).toMatchObject({ externalId: '456' });
  });
});

describe('publication URL identities', () => {
  it.each([
    [
      'twitter',
      'https://www.x.com/alice/status/123/?tracking=secret#fragment',
      '123',
      parents.twitter,
    ],
    [
      'twitter',
      'https://www.twitter.com/alice/status/123',
      '123',
      parents.twitter,
    ],
    ['linkedin', parents.linkedin, '123', parents.linkedin],
    [
      'linkedin',
      'https://www.linkedin.com/posts/alice_activity-123-abc',
      '123',
      'https://linkedin.com/posts/alice_activity-123-abc',
    ],
    ['reddit', parents.reddit, 'abc', parents.reddit],
    [
      'reddit',
      'https://old.reddit.com/comments/abc/title/',
      'abc',
      'https://old.reddit.com/comments/abc/title',
    ],
    [
      'youtube',
      'https://www.youtube.com/watch?v=abc&utm=secret',
      'abc',
      parents.youtube,
    ],
    [
      'youtube',
      'https://youtu.be/abc?feature=share',
      'abc',
      'https://youtu.be/abc',
    ],
    [
      'youtube',
      'https://youtube.com/shorts/abc',
      'abc',
      'https://youtube.com/shorts/abc',
    ],
    [
      'instagram',
      'https://www.instagram.com/reel/abc-_/',
      'abc-_',
      'https://instagram.com/reel/abc-_',
    ],
    ['facebook', parents.facebook, '123', parents.facebook],
    [
      'facebook',
      'https://facebook.com/posts/123',
      '123',
      'https://facebook.com/posts/123',
    ],
    [
      'facebook',
      'https://facebook.com/story.php?story_fbid=123&id=44&tracking=secret',
      '123',
      'https://facebook.com/story.php?id=44&story_fbid=123',
    ],
    [
      'facebook',
      'https://facebook.com/permalink.php?story_fbid=123',
      '123',
      'https://facebook.com/permalink.php?story_fbid=123',
    ],
    ['tiktok', parents.tiktok, '123', parents.tiktok],
  ] as const)(
    'normalizes %s publication %s',
    (platform, url, id, normalized) => {
      expect(
        normalizeExtensionPublication({ ...input, platform, url }),
      ).toEqual({
        externalId: ['instagram', 'linkedin', 'facebook'].includes(platform)
          ? null
          : id,
        urlIdentity: {
          kind:
            platform === 'instagram'
              ? 'instagram-shortcode'
              : platform === 'linkedin'
                ? 'linkedin-activity'
                : platform === 'facebook'
                  ? 'facebook-post-token'
                  : 'platform-publication-id',
          value:
            platform === 'linkedin'
              ? decodeURIComponent(
                  new URL(normalized).pathname.split('/').at(-1) ?? '',
                )
              : platform === 'facebook'
                ? (new URL(normalized).searchParams.get('story_fbid') ?? id)
                : id,
        },
        url: normalized,
        urlKind: 'permalink',
        contextUrl: null,
      });
    },
  );
  it.each([
    'https://twitter.com/alice',
    'https://twitter.com/login',
    'https://twitter.com/compose/post',
    'https://twitter.com/',
    'https://evil.twitter.com/alice/status/123',
    'http://twitter.com/alice/status/123',
    'https://twitter.com/alice//status/123',
    'https://twitter.com/alice/status/123/extra',
    'https://twitter.com/alice%2Fother/status/123',
    'https://linkedin.com/feed/update/urn:li:activity:123',
  ])('rejects foreign or non-publication URL %s', (url) => {
    expect(() => normalizeExtensionPublication({ ...input, url })).toThrow();
  });
  it('rejects a publication URL containing credentials', () => {
    const credentialedUrl = new URL(parents.twitter);
    credentialedUrl.username = 'fixture-author';
    credentialedUrl.password = 'fixture-password';
    expect(() =>
      normalizeExtensionPublication({
        ...input,
        url: credentialedUrl.toString(),
      }),
    ).toThrow();
  });
  it.each([
    ['youtube', 'https://youtube.com/watch?v=abc&v=def'],
    ['linkedin', `${parents.linkedin}?commentUrn=a&commentUrn=b`],
    [
      'facebook',
      'https://facebook.com/story.php?story_fbid=123&story_fbid=456',
    ],
  ] as const)(
    'rejects duplicate retained identity keys for %s',
    (platform, url) => {
      expect(() =>
        normalizeExtensionPublication({ ...input, platform, url }),
      ).toThrow();
    },
  );
  it('rejects nonnumeric Twitter post/reply status paths and nonalphanumeric Reddit comment tails', () => {
    for (const publicationKind of ['post', 'reply'] as const) {
      expect(() =>
        normalizeExtensionPublication({
          ...input,
          publicationKind,
          url: 'https://twitter.com/alice/status/opaque',
        }),
      ).toThrow();
    }
    expect(() =>
      normalizeExtensionPublication({
        ...input,
        platform: 'reddit',
        publicationKind: 'reply',
        url: `${parents.reddit}/comment-id`,
      }),
    ).toThrow();
    expect(() =>
      normalizeExtensionPublication({ ...input, externalId: '456' }),
    ).toThrow();
  });
  it('records Instagram shortcode identity without fabricating a Graph ID', () => {
    const publication = {
      ...input,
      platform: 'instagram' as const,
      url: parents.instagram,
    };
    expect(normalizeExtensionPublication(publication)).toMatchObject({
      externalId: null,
      urlIdentity: { kind: 'instagram-shortcode', value: 'abc' },
    });
    expect(
      normalizeExtensionPublication({ ...publication, externalId: 'abc' })
        .externalId,
    ).toBeNull();
    expect(() =>
      normalizeExtensionPublication({ ...publication, externalId: 'wrong' }),
    ).toThrow();
  });
  it.each([
    ['instagram', parents.instagram, '999', 'instagram-shortcode', 'abc'],
    [
      'linkedin',
      parents.linkedin,
      'urn:li:share:999',
      'linkedin-activity',
      'urn:li:activity:123',
    ],
    [
      'linkedin',
      parents.linkedin,
      'urn:li:ugcPost:999',
      'linkedin-activity',
      'urn:li:activity:123',
    ],
    [
      'facebook',
      'https://facebook.com/alice/posts/pfbidExample',
      '111_999',
      'facebook-post-token',
      'pfbidExample',
    ],
  ] as const)(
    'preserves explicitly reported %s provider ID separately from its permalink namespace',
    (platform, url, externalId, kind, value) => {
      const normalized = normalizeExtensionPublication({
        ...input,
        platform,
        url,
        externalId,
      });
      expect(normalized).toMatchObject({
        externalId,
        urlIdentity: { kind, value },
      });
      expect(
        extensionPublicationAnalyticsAvailability(
          externalId,
          'credential',
          platform,
          'post',
          normalized.urlIdentity,
        ),
      ).toBe('eligible');
    },
  );
  it.each([
    ['linkedin', parents.linkedin, 'urn:li:activity:123'],
    ['linkedin', parents.linkedin, '123'],
    [
      'facebook',
      'https://facebook.com/alice/posts/pfbidExample',
      'pfbidExample',
    ],
    ['facebook', parents.facebook, '123'],
  ] as const)(
    'keeps observed %s URL IDs as URL identity only',
    (platform, url, externalId) => {
      const normalized = normalizeExtensionPublication({
        ...input,
        platform,
        url,
        externalId,
      });
      expect(normalized.externalId).toBeNull();
      expect(
        extensionPublicationAnalyticsAvailability(
          null,
          'credential',
          platform,
          'post',
          normalized.urlIdentity,
        ),
      ).toBe('provider-id-unresolved');
      expect(() =>
        normalizeExtensionPublication({
          ...input,
          platform,
          url,
          externalId: 'wrong',
        }),
      ).toThrow();
    },
  );
  it.each([
    ['twitter', parents.twitter, '123'],
    ['reddit', `${parents.reddit}/def`, 'def'],
    ['youtube', `${parents.youtube}&lc=comment-1`, 'comment-1'],
    [
      'facebook',
      `${parents.facebook}?comment_id=comment-1&reply_comment_id=reply-1`,
      'reply-1',
    ],
    [
      'linkedin',
      `${parents.linkedin}?commentUrn=urn%3Ali%3Acomment%3A456`,
      'urn:li:comment:456',
    ],
  ] as const)(
    'resolves %s reply identity independently of its parent',
    (platform, url, id) => {
      const reply = {
        ...input,
        platform,
        url,
        publicationKind: 'reply' as const,
      };
      expect(normalizeExtensionPublication(reply).externalId).toBe(id);
      expect(() =>
        normalizeExtensionPublication({ ...reply, externalId: 'wrong' }),
      ).toThrow();
    },
  );
  it.each([
    'reddit',
    'youtube',
    'facebook',
    'linkedin',
    'instagram',
    'tiktok',
  ] as const)(
    'rejects %s parent permalink presented as a reply',
    (platform) => {
      expect(() =>
        normalizeExtensionPublication({
          ...input,
          platform,
          url: parents[platform],
          publicationKind: 'reply',
        }),
      ).toThrow();
    },
  );
  it.each(Object.keys(parents) as ExtensionPublicationPlatform[])(
    'keeps %s parent context separate from an observed comment ID',
    (platform) => {
      const reply: ExtensionPublicationCaptureInput = {
        ...input,
        platform,
        url: undefined,
        contextUrl: parents[platform],
        publicationKind: 'reply',
        externalId: platform === 'twitter' ? '456' : 'own-comment',
      };
      expect(normalizeExtensionPublication(reply)).toEqual({
        externalId: reply.externalId,
        url: null,
        contextUrl: parents[platform],
        urlKind: 'context-only',
        urlIdentity: null,
      });
      const parent = normalizeExtensionPublication({
        ...input,
        platform,
        url: parents[platform],
      });
      expect(() =>
        normalizeExtensionPublication({
          ...reply,
          externalId: parent.externalId ?? parent.urlIdentity?.value,
        }),
      ).toThrow();
    },
  );
});

describe('truthful analytics and replay locations', () => {
  it('applies the frozen reason precedence', () => {
    expect(
      extensionPublicationAnalyticsAvailability(null, null, 'reddit', 'reply'),
    ).toBe('unsupported-publication-kind');
    expect(
      extensionPublicationAnalyticsAvailability(
        'comment',
        'credential',
        'reddit',
        'reply',
      ),
    ).toBe('unsupported-publication-kind');
    expect(
      extensionPublicationAnalyticsAvailability(
        'comment',
        null,
        'youtube',
        'reply',
      ),
    ).toBe('unsupported-publication-kind');
    expect(
      extensionPublicationAnalyticsAvailability(
        '123',
        null,
        'twitter',
        'reply',
      ),
    ).toBe('missing-credential');
    expect(
      extensionPublicationAnalyticsAvailability(
        '123',
        'credential',
        'twitter',
        'reply',
      ),
    ).toBe('eligible');
  });
  it('keeps the positive action-platform intersection aligned with collector build definitions', () => {
    const source = readFileSync(
      'src/collections/workflows/services/analytics-sync-workflow.service.ts',
      'utf8',
    );
    const refreshDefinition = source
      .split('const ANALYTICS_POST_REFRESH_PLATFORMS = [')[1]
      .split('] as const;')[0];
    const organizationDefinition = source
      .split('private organizationRefreshDefinition()')[1]
      .split('const nodes =')[0];
    for (const platform of Object.keys(
      parents,
    ) as ExtensionPublicationPlatform[]) {
      const supported =
        extensionPublicationAnalyticsAvailability(
          platform === 'linkedin'
            ? 'urn:li:share:123'
            : platform === 'facebook'
              ? '123_456'
              : '123',
          'credential',
          platform,
          'post',
        ) === 'eligible';
      const token = `CredentialPlatform.${platform.toUpperCase()}`;
      expect(refreshDefinition.includes(token), platform).toBe(supported);
      expect(organizationDefinition.includes(token), platform).toBe(supported);
    }
  });
  it('derives replay location exclusively from saved data', () => {
    const post = {
      visibility: null,
      id: 'post',
      source: 'api',
      externalId: '123',
      credentialId: null,
      platform: 'twitter',
      url: null,
      targetSettings: {},
    };
    expect(extensionPublicationCaptureResult(post, false)).toMatchObject({
      source: 'api',
      urlKind: 'unavailable',
      url: null,
      contextUrl: null,
    });
    expect(
      extensionPublicationCaptureResult(
        {
          ...post,
          targetSettings: {
            extensionCapture: {
              contextUrl: parents.twitter,
              publicationKind: 'reply',
            },
          },
        },
        false,
      ),
    ).toMatchObject({ urlKind: 'context-only', contextUrl: parents.twitter });
    expect(
      extensionPublicationCaptureResult(
        {
          ...post,
          targetSettings: {
            extensionCapture: { contextUrl: 'https://evil.com' },
          },
        },
        false,
      ).urlKind,
    ).toBe('unavailable');
    expect(
      extensionPublicationCaptureResult(
        { ...post, url: parents.twitter },
        false,
      ),
    ).toMatchObject({ urlKind: 'permalink', contextUrl: null });
  });
});

describe('shared publication author proof', () => {
  const credential = {
    externalId: 'id',
    externalHandle: ' @Alice ',
    username: 'other',
  };
  it('requires ID match before any handle fallback', () => {
    expect(
      extensionPublicationAuthorMatchesCredential(
        { externalId: 'different', handle: 'alice' },
        credential,
      ),
    ).toBe(false);
    expect(
      extensionPublicationAuthorMatchesCredential(
        { externalId: 'id' },
        credential,
      ),
    ).toBe(true);
    expect(
      extensionPublicationAuthorMatchesCredential(
        { handle: 'ALICE' },
        credential,
      ),
    ).toBe(true);
    expect(
      extensionPublicationAuthorMatchesCredential(
        { handle: 'other' },
        credential,
      ),
    ).toBe(true);
    expect(
      extensionPublicationAuthorMatchesCredential({ handle: ' ' }, credential),
    ).toBe(false);
    expect(extensionPublicationAuthorMatchesCredential(null, credential)).toBe(
      false,
    );
  });
  it.each([
    null,
    {},
    { extensionCapture: { version: 2, author: { handle: 'alice' } } },
    { extensionCapture: { version: 1, author: {} } },
    { extensionCapture: { version: 1, author: { handle: ' ' } } },
    { extensionCapture: { version: 1, author: { externalId: 7 } } },
    { extensionCapture: { version: 1, author: { handle: 'a'.repeat(257) } } },
  ])('rejects malformed or missing stored author %j', (settings) =>
    expect(extensionPublicationObservedAuthor(settings)).toBeNull(),
  );
  it('reads only bounded version-one author fields', () =>
    expect(
      extensionPublicationObservedAuthor({
        extensionCapture: {
          version: 1,
          author: { handle: 'alice', externalId: 'id' },
        },
      }),
    ).toEqual({ handle: 'alice', externalId: 'id' }));
});

describe('Twitter context-only reply numeric identity', () => {
  const context = {
    ...input,
    url: undefined,
    publicationKind: 'reply' as const,
    contextUrl: parents.twitter,
  };
  it('retains distinct observed numeric ID without manufacturing a permalink', () =>
    expect(
      normalizeExtensionPublication({ ...context, externalId: '456' }),
    ).toMatchObject({ externalId: '456', url: null, urlKind: 'context-only' }));
  it.each([
    'letters',
    ' 456',
    '456 ',
    '+456',
    '-456',
    '4.56',
    '4e5',
    'urn:comment:456',
    '456letters',
    '123',
  ])('rejects nonnumeric or parent identity %s', (externalId) =>
    expect(() =>
      normalizeExtensionPublication({ ...context, externalId }),
    ).toThrow(),
  );
});
