import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';

describe('CharacterImageInspectionService', () => {
  const prisma = {
    ingredient: { findFirst: vi.fn() },
    persona: { findFirst: vi.fn() },
  };
  const cache = { getOrSetWithLock: vi.fn() };
  const vision = { chatCompletion: vi.fn() };
  const updatedAt = new Date('2026-09-08T12:00:00Z');
  let service: CharacterImageInspectionService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'image-1',
      cdnUrl: 'https://cdn.example.com/image.png',
      personaId: null,
      updatedAt,
    });
    prisma.persona.findFirst.mockResolvedValue(null);
    cache.getOrSetWithLock.mockImplementation(
      (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    vision.chatCompletion.mockResolvedValue({
      choices: [
        { message: { content: '{"hasFace":true,"isCharacter":true}' } },
      ],
    });
    const module = await Test.createTestingModule({
      providers: [
        CharacterImageInspectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: OpenRouterService, useValue: vision },
      ],
    }).compile();
    service = module.get(CharacterImageInspectionService);
  });

  it('inspects actual image pixels and scopes both database lookups to the active brand', async () => {
    const result = await service.inspect('image-1', 'org-1', 'brand-1');
    expect(result).toMatchObject({
      id: 'image-1',
      hasFace: true,
      isCharacter: true,
      characterId: null,
    });
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'image-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          category: { in: ['IMAGE', 'IMAGE_EDIT'] },
          status: { in: ['GENERATED', 'UPLOADED', 'VALIDATED'] },
        },
      }),
    );
    expect(prisma.persona.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          OR: [{ avatarIngredientId: 'image-1' }],
        },
      }),
    );
    expect(vision.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: expect.any(String) },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://cdn.example.com/image.png' },
              },
            ],
          },
        ],
      }),
    );
  });

  it('rejects inaccessible or unfinished images before inference', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(
      service.inspect('foreign-image', 'org-1', 'brand-1'),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(prisma.persona.findFirst).not.toHaveBeenCalled();
    expect(vision.chatCompletion).not.toHaveBeenCalled();
  });

  it.each([null, 'character-1'])(
    'recognizes saved references and generated images with personaId=%s without inference',
    async (personaId) => {
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'image-1',
        cdnUrl: 'https://cdn.example.com/image.png',
        personaId,
        updatedAt,
      });
      prisma.persona.findFirst.mockResolvedValue({
        id: 'character-1',
        handle: 'anna',
        label: 'Anna',
      });
      expect(
        await service.inspect('image-1', 'org-1', 'brand-1'),
      ).toMatchObject({
        characterId: 'character-1',
        handle: 'anna',
        label: 'Anna',
      });
      const alternatives = [
        { avatarIngredientId: 'image-1' },
        ...(personaId ? [{ id: personaId }] : []),
      ];
      expect(prisma.persona.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: alternatives }),
        }),
      );
      expect(vision.chatCompletion).not.toHaveBeenCalled();
      expect(cache.getOrSetWithLock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    'preserves independent face=%s and character=%s results',
    async (hasFace, isCharacter) => {
      vision.chatCompletion.mockResolvedValue({
        choices: [
          { message: { content: JSON.stringify({ hasFace, isCharacter }) } },
        ],
      });
      expect(
        await service.inspect('image-1', 'org-1', 'brand-1'),
      ).toMatchObject({ hasFace, isCharacter });
    },
  );

  it('reuses cached classification while rechecking saved associations', async () => {
    cache.getOrSetWithLock.mockResolvedValue({
      hasFace: false,
      isCharacter: true,
    });
    expect(await service.inspect('image-1', 'org-1', 'brand-1')).toMatchObject({
      hasFace: false,
      isCharacter: true,
    });
    expect(cache.getOrSetWithLock).toHaveBeenCalledWith(
      'character-image:v1:org-1:brand-1:image-1:2026-09-08T12:00:00.000Z',
      expect.any(Function),
      { ttl: 86400 },
      30,
    );
    expect(vision.chatCompletion).not.toHaveBeenCalled();
    expect(prisma.persona.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    'unavailable',
    'invalid JSON',
    '{"hasFace":"yes","isCharacter":true}',
  ])(
    'returns unknown instead of a negative detection on %s',
    async (response) => {
      if (response === 'unavailable')
        vision.chatCompletion.mockRejectedValue(new Error('unavailable'));
      else
        vision.chatCompletion.mockResolvedValue({
          choices: [{ message: { content: response } }],
        });
      expect(
        await service.inspect('image-1', 'org-1', 'brand-1'),
      ).toMatchObject({ hasFace: null, isCharacter: null, characterId: null });
    },
  );

  it('does not send local or absent URLs to the vision service', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'image-1',
      cdnUrl: 'http://localhost/image.png',
      personaId: null,
      updatedAt,
    });
    expect(await service.inspect('image-1', 'org-1', 'brand-1')).toMatchObject({
      hasFace: null,
      isCharacter: null,
    });
    expect(vision.chatCompletion).not.toHaveBeenCalled();
  });
});
