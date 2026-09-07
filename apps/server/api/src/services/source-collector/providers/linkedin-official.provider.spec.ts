vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `decrypted:${value}` },
}));

import { LinkedinOfficialProvider } from '@api/services/source-collector/providers/linkedin-official.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { of, throwError } from 'rxjs';

describe('LinkedinOfficialProvider', () => {
  const httpService = { get: vi.fn() };
  const credentialsService = { resolveBrandAccount: vi.fn() };
  const linkedInService = { refreshToken: vi.fn() };
  const context = {
    brandId: 'brand-1',
    credentialId: 'cred-1',
    organizationId: 'org-1',
  };

  let provider: LinkedinOfficialProvider;

  function ugcPage(ids: string[], total?: number) {
    return of({
      data: {
        elements: ids.map((id, index) => ({
          author: 'urn:li:person:member-1',
          created: { time: Date.parse('2026-09-01T10:00:00Z') - index * 1000 },
          id,
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: [{ originalUrl: `https://media/${id}.jpg` }],
              shareCommentary: { text: `post ${id}` },
              shareMediaCategory: 'IMAGE',
            },
          },
        })),
        paging: { total: total ?? ids.length },
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    credentialsService.resolveBrandAccount.mockResolvedValue({
      accessToken: 'enc',
      accessTokenExpiry: new Date(Date.now() + 60_000),
      externalId: 'member-1',
      externalName: 'Vincent',
      id: 'cred-1',
    });
    provider = new LinkedinOfficialProvider(
      httpService as never,
      credentialsService as never,
      linkedInService as never,
    );
  });

  it('is own-account only', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.LINKEDIN, context),
    ).resolves.toBe(true);
    await expect(
      provider.canCollect(SocialSourcePlatform.YOUTUBE, context),
    ).resolves.toBe(false);
  });

  it('lists the member posts and attaches social actions', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.endsWith('/ugcPosts')) {
        return ugcPage(['urn:li:share:1', 'urn:li:share:2']);
      }
      if (url.includes('/socialActions/')) {
        return of({
          data: {
            commentsSummary: { totalFirstLevelComments: 3 },
            likesSummary: { totalLikes: 40 },
          },
        });
      }
      return throwError(() => new Error(`unexpected ${url}`));
    });

    const result = await provider.collectTimeline(
      SocialSourcePlatform.LINKEDIN,
      'vincent',
      context,
    );

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]).toMatchObject({
      authorDisplayName: 'Vincent',
      authorId: 'urn:li:person:member-1',
      authorUsername: 'vincent',
      contentType: 'image',
      contentUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1',
      id: 'urn:li:share:1',
      mediaUrls: ['https://media/urn:li:share:1.jpg'],
      metrics: { comments: 3, likes: 40 },
      text: 'post urn:li:share:1',
    });
    const ugcCall = httpService.get.mock.calls.find((call) =>
      String(call[0]).endsWith('/ugcPosts'),
    );
    expect(ugcCall?.[1].params).toMatchObject({
      authors: 'List(urn:li:person:member-1)',
      q: 'authors',
      start: 0,
    });
    expect(ugcCall?.[1].headers.Authorization).toBe('Bearer decrypted:enc');
  });

  it('refreshes an expired token before reading', async () => {
    credentialsService.resolveBrandAccount.mockResolvedValue({
      accessToken: 'stale',
      accessTokenExpiry: new Date(Date.now() - 60_000),
      externalId: 'member-1',
      id: 'cred-1',
    });
    linkedInService.refreshToken.mockResolvedValue({ accessToken: 'renewed' });
    httpService.get.mockReturnValue(ugcPage([]));

    await provider.collectTimeline(
      SocialSourcePlatform.LINKEDIN,
      'vincent',
      context,
    );

    expect(linkedInService.refreshToken).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
    expect(httpService.get.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer decrypted:renewed',
    );
  });

  it('keeps the post when social actions fail', async () => {
    httpService.get.mockImplementation((url: string) =>
      url.endsWith('/ugcPosts')
        ? ugcPage(['urn:li:share:9'])
        : throwError(() => new Error('403')),
    );

    const result = await provider.collectTimeline(
      SocialSourcePlatform.LINKEDIN,
      'vincent',
      context,
    );

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].metrics).toEqual({});
  });

  it('fails loudly without a member id', async () => {
    credentialsService.resolveBrandAccount.mockResolvedValue({
      accessToken: 'enc',
      externalId: null,
      id: 'cred-1',
    });

    await expect(
      provider.collectTimeline(
        SocialSourcePlatform.LINKEDIN,
        'vincent',
        context,
      ),
    ).rejects.toThrow('member id');
  });
});
