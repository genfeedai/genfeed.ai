vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));

import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { MediumPublisherService } from '@api/services/integrations/publishers/medium-publisher.service';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('MediumPublisherService', () => {
  let service: MediumPublisherService;
  let mediumService: { createPost: ReturnType<typeof vi.fn> };

  const mockCredential = {
    accessToken: 'encrypted-token',
    externalId: 'medium-user-1',
    id: 'credential-1',
    platform: CredentialPlatform.MEDIUM,
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
      description: '<h2>Intro</h2><p>Hello world</p>',
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
    mediumService = {
      createPost: vi.fn().mockResolvedValue({
        id: 'story-1',
        url: 'https://medium.com/@writer/launch-notes-story-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediumPublisherService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'https://cdn.test' },
        },
        { provide: MediumService, useValue: mediumService },
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

    service = module.get(MediumPublisherService);
  });

  afterEach(() => vi.clearAllMocks());

  it('publishes the post HTML as a public story for the context account', async () => {
    const result = await service.publish(makeContext());

    expect(mediumService.createPost).toHaveBeenCalledWith(
      'dec:encrypted-token',
      'medium-user-1',
      {
        contentHtml: '<h2>Intro</h2><p>Hello world</p>',
        publishStatus: 'public',
        title: 'Launch notes',
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'story-1',
        success: true,
        url: 'https://medium.com/@writer/launch-notes-story-1',
      }),
    );
  });

  it('creates a Medium draft and reports it as a provider draft', async () => {
    const result = await service.publish(makeContext({ isDraft: true }));

    expect(mediumService.createPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ publishStatus: 'draft' }),
    );
    expect(result.isProviderDraft).toBe(true);
  });

  it('fails without calling Medium when the credential has no user id', async () => {
    const result = await service.publish(
      makeContext({
        credential: { ...mockCredential, externalId: undefined } as never,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/credential or user ID/);
    expect(mediumService.createPost).not.toHaveBeenCalled();
  });

  it('falls back to the short-link URL when Medium omits one', async () => {
    mediumService.createPost.mockResolvedValue({ id: 'story-2' });

    const result = await service.publish(makeContext());

    expect(result.url).toBe('https://medium.com/p/story-2');
  });

  it('fails when Medium returns no story id', async () => {
    mediumService.createPost.mockResolvedValue({});

    const result = await service.publish(makeContext());

    expect(result.success).toBe(false);
  });
});
