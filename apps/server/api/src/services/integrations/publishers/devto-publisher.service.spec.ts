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
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('DevtoPublisherService', () => {
  let service: DevtoPublisherService;
  let devtoService: { createArticle: ReturnType<typeof vi.fn> };

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

  it('fails without calling Dev.to when the credential has no API key', async () => {
    const result = await service.publish(
      makeContext({
        credential: { ...mockCredential, accessToken: undefined } as never,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/credential not found/);
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
  });
});
