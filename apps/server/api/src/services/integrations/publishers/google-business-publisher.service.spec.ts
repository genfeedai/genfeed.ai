import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { GoogleBusinessApiError } from '@api/services/integrations/google-business/google-business-error.util';
import type {
  GoogleBusinessLocalPost,
  GoogleBusinessLocalPostInput,
} from '@api/services/integrations/google-business/interfaces/google-business.interface';
import { GoogleBusinessService } from '@api/services/integrations/google-business/services/google-business.service';
import { GoogleBusinessPublisherService } from '@api/services/integrations/publishers/google-business-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

const LOCATION = 'accounts/111/locations/222';
const SEARCH_URL = 'https://posts.google.example/abc';
const ATTEMPT_STARTED_AT = new Date('2026-11-16T10:00:00.000Z');

type FakeBusiness = {
  createLocalPost: (
    credential: CredentialDocument,
    location: string,
    post: GoogleBusinessLocalPostInput,
  ) => Promise<GoogleBusinessLocalPost>;
  listLocalPosts: (
    credential: CredentialDocument,
    location: string,
    pageToken?: string,
  ) => Promise<{
    nextPageToken: string | null;
    posts: GoogleBusinessLocalPost[];
  }>;
  markDisconnected: (
    credential: CredentialDocument,
    error: unknown,
  ) => Promise<void>;
};

describe('GoogleBusinessPublisherService', () => {
  let publisher: GoogleBusinessPublisherService;
  let sent: GoogleBusinessLocalPostInput[];
  let disconnected: string[];
  let fake: FakeBusiness;

  const credential = {
    externalId: LOCATION,
    externalName: 'Corner Cafe',
    id: 'cred-1',
    platform: CredentialPlatform.GOOGLE_BUSINESS,
  } as unknown as CredentialDocument;

  const makeContext = (
    overrides: {
      category?: PostCategory;
      credential?: CredentialDocument;
      description?: string;
      ingredients?: string[];
      settings?: Record<string, unknown>;
    } = {},
  ): PublishContext =>
    ({
      brandId: 'brand-1',
      credential: overrides.credential ?? credential,
      hasThreadChildren: false,
      organization: { id: 'org-1' },
      organizationId: 'org-1',
      post: {
        category: overrides.category ?? PostCategory.TEXT,
        description: overrides.description ?? 'Fresh bread at 7am',
        id: 'post-1',
        ingredients: overrides.ingredients ?? [],
      },
      postId: 'post-1',
      settings: overrides.settings ?? {},
    }) as unknown as PublishContext;

  beforeEach(async () => {
    sent = [];
    disconnected = [];
    fake = {
      createLocalPost: async (_credential, _location, post) => {
        sent.push(post);
        return {
          name: `${LOCATION}/localPosts/333`,
          searchUrl: SEARCH_URL,
          state: 'LIVE',
        };
      },
      listLocalPosts: async () => ({ nextPageToken: null, posts: [] }),
      markDisconnected: async (cred) => {
        disconnected.push(cred.id);
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleBusinessPublisherService,
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://cdn.genfeed.test',
            isAuthorizedMediaDeliveryEnabled: false,
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: GoogleBusinessService,
          useValue: {
            createLocalPost: (
              ...args: Parameters<FakeBusiness['createLocalPost']>
            ) => fake.createLocalPost(...args),
            listLocalPosts: (
              ...args: Parameters<FakeBusiness['listLocalPosts']>
            ) => fake.listLocalPosts(...args),
            markDisconnected: (
              ...args: Parameters<FakeBusiness['markDisconnected']>
            ) => fake.markDisconnected(...args),
          },
        },
      ],
    }).compile();
    publisher = moduleRef.get(GoogleBusinessPublisherService);
  });

  it('publishes a text update and returns its stored URL', async () => {
    const result = await publisher.publish(makeContext());

    expect(result).toMatchObject({
      externalId: `${LOCATION}/localPosts/333`,
      success: true,
      url: SEARCH_URL,
    });
    expect(sent).toEqual([
      { summary: 'Fresh bread at 7am', topicType: 'STANDARD' },
    ]);
  });

  it('sends one image as a photo', async () => {
    await publisher.publish(
      makeContext({ category: PostCategory.IMAGE, ingredients: ['img-1'] }),
    );

    expect(sent).toEqual([
      {
        media: [
          {
            mediaFormat: 'PHOTO',
            sourceUrl: 'https://cdn.genfeed.test/images/img-1',
          },
        ],
        summary: 'Fresh bread at 7am',
        topicType: 'STANDARD',
      },
    ]);
  });

  it('sends a call-to-action button with its link', async () => {
    await publisher.publish(
      makeContext({
        settings: {
          callToActionType: 'BOOK',
          callToActionUrl: 'https://cafe.example/book',
        },
      }),
    );

    expect(sent[0]?.callToAction).toEqual({
      actionType: 'BOOK',
      url: 'https://cafe.example/book',
    });
  });

  it('sends a Call button without a link', async () => {
    await publisher.publish(
      makeContext({
        settings: {
          callToActionType: 'CALL',
          callToActionUrl: 'https://ignored.example',
        },
      }),
    );

    expect(sent[0]?.callToAction).toEqual({ actionType: 'CALL' });
  });

  it.each([
    [
      'a video',
      { category: PostCategory.VIDEO, ingredients: ['vid-1'] },
      'google_business_media_unsupported',
    ],
    [
      'two photos',
      { category: PostCategory.IMAGE, ingredients: ['img-1', 'img-2'] },
      'google_business_media_unsupported',
    ],
    [
      'a caption over 1500 characters',
      { description: 'x'.repeat(1_501) },
      'caption_too_long',
    ],
    [
      'an empty caption',
      { description: '  ' },
      'google_business_text_required',
    ],
    [
      'a button with no link',
      { settings: { callToActionType: 'SHOP' } },
      'google_business_cta_invalid',
    ],
    [
      'a link with no button',
      { settings: { callToActionUrl: 'https://cafe.example' } },
      'google_business_cta_invalid',
    ],
  ])(
    'rejects %s before calling Google',
    async (_label, overrides, errorCode) => {
      const result = await publisher.publish(makeContext(overrides));

      expect(result).toMatchObject({ errorCode, success: false });
      expect(sent).toEqual([]);
    },
  );

  it('fails without a connected location', async () => {
    const result = await publisher.publish(
      makeContext({
        credential: {
          ...credential,
          externalId: null,
        } as unknown as CredentialDocument,
      }),
    );

    expect(result).toMatchObject({
      errorCode: 'google_business_location_missing',
      success: false,
    });
  });

  it('fails at once with the reason when Google rejects the content', async () => {
    fake.createLocalPost = async () => {
      throw new GoogleBusinessApiError(
        'Google Business Profile post creation failed (400): summary is invalid',
        400,
        'INVALID_ARGUMENT',
      );
    };

    const result = await publisher.publish(makeContext());

    expect(result).toMatchObject({
      error: expect.stringContaining('summary is invalid'),
      errorCode: 'google_business_content_rejected',
      success: false,
    });
  });

  it('fails when Google parks the post as rejected for policy', async () => {
    fake.createLocalPost = async () => ({
      name: `${LOCATION}/localPosts/333`,
      state: 'REJECTED',
    });

    const result = await publisher.publish(makeContext());

    expect(result).toMatchObject({
      errorCode: 'google_business_post_rejected',
      success: false,
    });
  });

  it('disconnects the channel when Google refuses a refreshed token', async () => {
    fake.createLocalPost = async () => {
      throw new GoogleBusinessApiError('refused (401)', 401, 'UNAUTHENTICATED');
    };

    const result = await publisher.publish(makeContext());

    expect(result).toMatchObject({
      errorCode: 'google_business_disconnected',
      success: false,
    });
    expect(disconnected).toEqual(['cred-1']);
  });

  it('lets a rate limit reach the pipeline to retry', async () => {
    fake.createLocalPost = async () => {
      throw new GoogleBusinessApiError(
        'rate limited (429)',
        429,
        'RESOURCE_EXHAUSTED',
      );
    };

    await expect(publisher.publish(makeContext())).rejects.toThrow('(429)');
  });

  describe('verifyPublished', () => {
    const post = (
      summary: string,
      createTime: string,
    ): GoogleBusinessLocalPost => ({
      createTime,
      name: `${LOCATION}/localPosts/777`,
      searchUrl: SEARCH_URL,
      summary,
    });

    it('returns the post that landed with the same text', async () => {
      fake.listLocalPosts = async () => ({
        nextPageToken: null,
        posts: [post('Fresh bread at 7am', '2026-11-16T10:00:03.000Z')],
      });

      const result = await publisher.verifyPublished(
        makeContext(),
        ATTEMPT_STARTED_AT,
      );

      expect(result).toMatchObject({
        externalId: `${LOCATION}/localPosts/777`,
        success: true,
      });
    });

    it('confirms absence only when no post appeared since the attempt', async () => {
      fake.listLocalPosts = async () => ({
        nextPageToken: null,
        posts: [post('Older post', '2026-11-16T09:00:00.000Z')],
      });

      await expect(
        publisher.verifyPublished(makeContext(), ATTEMPT_STARTED_AT),
      ).resolves.toBeNull();
    });

    it('stays uncertain when a different post appeared since the attempt', async () => {
      fake.listLocalPosts = async () => ({
        nextPageToken: null,
        posts: [post('Fresh bread at 7am!', '2026-11-16T10:00:03.000Z')],
      });

      await expect(
        publisher.verifyPublished(makeContext(), ATTEMPT_STARTED_AT),
      ).rejects.toThrow('different post');
    });

    it('stays uncertain for a post with media', async () => {
      await expect(
        publisher.verifyPublished(
          makeContext({ category: PostCategory.IMAGE, ingredients: ['img-1'] }),
          ATTEMPT_STARTED_AT,
        ),
      ).rejects.toThrow('lacks exact text/media proof');
    });
  });
});
