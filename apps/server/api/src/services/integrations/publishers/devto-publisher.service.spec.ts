vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => `dec:${value}`) },
}));

import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { DevtoPublisherService } from '@api/services/integrations/publishers/devto-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  PublishErrorKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('DevtoPublisherService', () => {
  let service: DevtoPublisherService;
  let devtoService: {
    createArticle: ReturnType<typeof vi.fn>;
    listPublishVerificationPage: ReturnType<typeof vi.fn>;
  };

  const mockCredential = {
    accessToken: 'encrypted-token',
    externalHandle: 'devfounder',
    externalId: '12345',
    id: 'credential-1',
    platform: CredentialPlatform.DEV_TO,
  };

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    brandId: 'brand-1',
    credential: mockCredential as never,
    organization: { id: 'org-1' } as unknown as OrganizationDocument,
    organizationId: 'org-1',
    post: {
      category: PostCategory.TEXT,
      description: '<h2>Intro</h2><p>Hello <strong>world</strong></p>',
      id: 'post-1',
      ingredients: [],
      label: 'Launch notes',
      status: PostStatus.DRAFT,
    } as never,
    postId: 'post-1',
    settings: {},
    ...overrides,
  });

  beforeEach(async () => {
    devtoService = {
      createArticle: vi.fn().mockResolvedValue({
        id: 999,
        url: 'https://dev.to/devfounder/launch-notes-999',
      }),
      listPublishVerificationPage: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevtoPublisherService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'https://cdn.test' },
        },
        { provide: DevtoService, useValue: devtoService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(DevtoPublisherService);
  });

  afterEach(() => vi.clearAllMocks());

  it('sends Markdown converted from the post HTML for the context account', async () => {
    const result = await service.publish(makeContext());

    expect(devtoService.createArticle).toHaveBeenCalledWith(
      'dec:encrypted-token',
      {
        bodyMarkdown: expect.stringContaining('## Intro'),
        published: true,
        tags: [],
        title: 'Launch notes',
      },
    );
    const body = devtoService.createArticle.mock.calls[0]?.[1].bodyMarkdown;
    expect(body).toContain('**world**');
    expect(body).not.toContain('<h2>');
    expect(body).not.toContain('<p>');
    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: '999',
        success: true,
        url: 'https://dev.to/devfounder/launch-notes-999',
      }),
    );
  });

  it('creates a Dev.to draft and reports it as a provider draft', async () => {
    const result = await service.publish(makeContext({ isDraft: true }));

    expect(devtoService.createArticle).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ published: false }),
    );
    expect(result.isProviderDraft).toBe(true);
  });

  it('sends at most four tags from the channel setting', async () => {
    await service.publish(
      makeContext({
        settings: { tags: 'typescript, webdev, node, api, fifth' },
      }),
    );

    expect(devtoService.createArticle).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: ['typescript', 'webdev', 'node', 'api'],
      }),
    );
  });

  it('passes the canonical URL and series channel settings to Dev.to', async () => {
    await service.publish(
      makeContext({
        settings: {
          canonicalUrl: 'https://genfeed.ai/articles/launch-notes',
          series: ' Genfeed, from brief to feed ',
        },
      }),
    );

    expect(devtoService.createArticle).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        canonicalUrl: 'https://genfeed.ai/articles/launch-notes',
        series: 'Genfeed, from brief to feed',
      }),
    );
  });

  it('rejects a canonical URL that is not https instead of publishing a Dev.to original', async () => {
    const result = await service.publish(
      makeContext({ settings: { canonicalUrl: 'genfeed.ai/articles/x' } }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/canonical URL/);
    expect(result.errorKind).toBe(PublishErrorKind.CONTENT_REJECTED);
    expect(devtoService.createArticle).not.toHaveBeenCalled();
  });

  it('fails without calling Dev.to when the credential has no API key', async () => {
    const result = await service.publish(
      makeContext({
        credential: { ...mockCredential, accessToken: undefined } as never,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/credential not found/);
    expect(result.errorKind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
    expect(devtoService.createArticle).not.toHaveBeenCalled();
  });

  it('falls back to the author URL when Dev.to omits one', async () => {
    devtoService.createArticle.mockResolvedValue({ id: 1000 });

    const result = await service.publish(makeContext());

    expect(result.url).toBe('https://dev.to/devfounder/1000');
  });

  it('fails when Dev.to returns no article id', async () => {
    devtoService.createArticle.mockResolvedValue({});

    const result = await service.publish(makeContext());

    expect(result.success).toBe(false);
    expect(result.errorKind).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
  });

  it.each([
    [401, PublishErrorKind.CHANNEL_DISCONNECTED],
    [404, PublishErrorKind.CHANNEL_DISCONNECTED],
    [422, PublishErrorKind.CONTENT_REJECTED],
    [503, PublishErrorKind.OUTCOME_UNKNOWN],
  ])('throws a typed publish error for HTTP %i', async (status, kind) => {
    devtoService.createArticle.mockRejectedValue(
      Object.assign(new Error('provider failed'), {
        response: { headers: {}, status },
      }),
    );

    await expect(service.publish(makeContext())).rejects.toMatchObject({
      httpStatus: status,
      kind,
      name: 'PublishError',
    });
  });

  it('throws rate_limited with the wait the provider gave', async () => {
    devtoService.createArticle.mockRejectedValue(
      Object.assign(new Error('provider failed'), {
        response: { headers: { 'retry-after': '20' }, status: 429 },
      }),
    );

    await expect(service.publish(makeContext())).rejects.toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      retryAfterMs: 20_000,
    });
  });

  it('throws outcome_unknown when the connection drops mid-request', async () => {
    devtoService.createArticle.mockRejectedValue(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    );

    await expect(service.publish(makeContext())).rejects.toMatchObject({
      kind: PublishErrorKind.OUTCOME_UNKNOWN,
    });
  });

  describe('verifyPublished', () => {
    const startedAt = new Date('2026-10-03T10:00:00Z');
    const afterGrace = new Date('2026-10-03T12:00:00Z');
    const landed = {
      createdAt: new Date('2026-10-03T10:00:03Z'),
      hasMedia: false,
      id: '999',
      isReply: false,
      text: '',
      title: 'Launch notes',
      url: 'https://dev.to/devfounder/launch-notes-999',
    };

    beforeEach(() => vi.useFakeTimers({ now: afterGrace }));
    afterEach(() => vi.useRealTimers());

    it('settles an uncertain publish as published with its article URL', async () => {
      devtoService.listPublishVerificationPage.mockResolvedValue({
        items: [landed],
        nextCursor: null,
      });

      const result = await service.verifyPublished(makeContext(), startedAt);

      expect(result).toMatchObject({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: '999',
        url: 'https://dev.to/devfounder/launch-notes-999',
      });
      expect(devtoService.listPublishVerificationPage).toHaveBeenCalledWith(
        'dec:encrypted-token',
        false,
        startedAt,
        undefined,
      );
    });

    it('settles an uncertain scheduler draft from the drafts list', async () => {
      devtoService.listPublishVerificationPage.mockResolvedValue({
        items: [landed],
        nextCursor: null,
      });

      const result = await service.verifyPublished(
        makeContext({ isDraft: true }),
        startedAt,
      );

      expect(result).toMatchObject({
        externalId: '999',
        isProviderDraft: true,
      });
      expect(devtoService.listPublishVerificationPage).toHaveBeenCalledWith(
        'dec:encrypted-token',
        true,
        startedAt,
        undefined,
      );
    });

    it('reports a missing article so the next attempt can publish', async () => {
      devtoService.listPublishVerificationPage.mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      expect(
        await service.verifyPublished(makeContext(), startedAt),
      ).toBeNull();
    });

    it('stays unknown for a post with no title to match', async () => {
      await expect(
        service.verifyPublished(
          makeContext({
            post: {
              category: PostCategory.TEXT,
              description: '<p>Body</p>',
              id: 'post-1',
              ingredients: [],
            } as never,
          }),
          startedAt,
        ),
      ).rejects.toThrow('exact title');
      expect(devtoService.listPublishVerificationPage).not.toHaveBeenCalled();
    });

    it('stays unknown when the provider lookup fails', async () => {
      devtoService.listPublishVerificationPage.mockRejectedValue(
        new Error('provider 503'),
      );

      await expect(
        service.verifyPublished(makeContext(), startedAt),
      ).rejects.toThrow('provider 503');
    });
  });
});
