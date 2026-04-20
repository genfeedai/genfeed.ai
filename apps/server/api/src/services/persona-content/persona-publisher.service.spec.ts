import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PersonaPublisherService', () => {
  let service: PersonaPublisherService;
  let personasService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let postsService: { create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    personasService = {
      findOne: vi.fn(),
    };
    credentialsService = {
      findOne: vi.fn(),
    };
    postsService = {
      create: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonaPublisherService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: PersonasService, useValue: personasService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile();

    service = module.get<PersonaPublisherService>(PersonaPublisherService);
  });

  it('publishes only matching platform credentials when platforms filter is provided', async () => {
    const personaId = 'test-object-id';
    const organizationId = 'test-object-id';
    const userId = 'test-object-id';
    const brandId = 'test-object-id';
    const ingredientId = 'test-object-id';
    const instagramCredentialId = 'test-object-id';
    const tiktokCredentialId = 'test-object-id';

    personasService.findOne.mockResolvedValue({
      credentials: [instagramCredentialId, tiktokCredentialId],
      label: 'Test Persona',
    });
    credentialsService.findOne
      .mockResolvedValueOnce({
        _id: instagramCredentialId,
        platform: 'instagram',
      })
      .mockResolvedValueOnce({
        _id: tiktokCredentialId,
        platform: 'tiktok',
      });
    postsService.create.mockResolvedValueOnce({ _id: 'test-object-id' });

    const result = await service.publishToAll({
      brand: brandId,
      category: PostCategory.POST,
      description: 'Test post',
      ingredientIds: [ingredientId],
      organization: organizationId,
      personaId,
      platforms: ['tiktok'],
      user: userId,
    });

    expect(postsService.create).toHaveBeenCalledTimes(1);
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: tiktokCredentialId,
        platform: 'tiktok',
      }),
    );
    expect(result.failedCredentials).toEqual([]);
    expect(result.totalCreated).toBe(1);
  });

  it('throws when persona does not exist', async () => {
    personasService.findOne.mockResolvedValue(null);

    await expect(
      service.publishToAll({
        brand: 'test-object-id',
        description: 'Test post',
        organization: 'test-object-id',
        personaId: 'test-object-id',
        user: 'test-object-id',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('publishes to all credentials when no platforms filter', async () => {
    const credId1 = 'test-object-id';
    const credId2 = 'test-object-id';

    personasService.findOne.mockResolvedValue({
      credentials: [credId1, credId2],
      label: 'All Platforms',
    });
    credentialsService.findOne
      .mockResolvedValueOnce({ _id: credId1, platform: 'instagram' })
      .mockResolvedValueOnce({ _id: credId2, platform: 'twitter' });
    postsService.create
      .mockResolvedValueOnce({ _id: 'test-object-id' })
      .mockResolvedValueOnce({ _id: 'test-object-id' });

    const result = await service.publishToAll({
      brand: 'test-object-id',
      description: 'Post everywhere',
      organization: 'test-object-id',
      personaId: 'test-object-id',
      user: 'test-object-id',
    });

    expect(result.totalCreated).toBe(2);
    expect(postsService.create).toHaveBeenCalledTimes(2);
  });

  it('tracks failed credentials when post creation throws', async () => {
    const credId = 'test-object-id';

    personasService.findOne.mockResolvedValue({
      credentials: [credId],
      label: 'Fail Persona',
    });
    credentialsService.findOne.mockResolvedValue({
      _id: credId,
      platform: 'twitter',
    });
    postsService.create.mockRejectedValue(new Error('DB error'));

    const result = await service.publishToAll({
      brand: 'test-object-id',
      description: 'Will fail',
      organization: 'test-object-id',
      personaId: 'test-object-id',
      user: 'test-object-id',
    });

    expect(result.failedCredentials).toContain(String(credId));
    expect(result.totalCreated).toBe(0);
  });

  it('skips credentials not found in database', async () => {
    const credId = 'test-object-id';

    personasService.findOne.mockResolvedValue({
      credentials: [credId],
      label: 'Missing Cred',
    });
    credentialsService.findOne.mockResolvedValue(null);

    const result = await service.publishToAll({
      brand: 'test-object-id',
      description: 'No cred',
      organization: 'test-object-id',
      personaId: 'test-object-id',
      user: 'test-object-id',
    });

    expect(result.failedCredentials).toContain(String(credId));
    expect(result.totalCreated).toBe(0);
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('sets SCHEDULED status when scheduledDate is provided', async () => {
    const credId = 'test-object-id';
    const futureDate = new Date('2026-12-31');

    personasService.findOne.mockResolvedValue({
      credentials: [credId],
      label: 'Scheduled',
    });
    credentialsService.findOne.mockResolvedValue({
      _id: credId,
      platform: 'instagram',
    });
    postsService.create.mockResolvedValue({ _id: 'test-object-id' });

    await service.publishToAll({
      brand: 'test-object-id',
      description: 'Scheduled post',
      organization: 'test-object-id',
      personaId: 'test-object-id',
      scheduledDate: futureDate,
      user: 'test-object-id',
    });

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledDate: futureDate,
        status: 'scheduled',
      }),
    );
  });
});
