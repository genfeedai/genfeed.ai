import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PersonasService', () => {
  let service: PersonasService;
  let prisma: {
    persona: { create: ReturnType<typeof vi.fn> };
    ingredient: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      ingredient: { findFirst: vi.fn() },
      persona: {
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonasService,
        { provide: PrismaService, useValue: prisma },
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

    service = module.get(PersonasService);
  });

  it('rejects invalid handles before writing', async () => {
    await expect(
      service.create({
        handle: 'anna doe',
        label: 'Anna',
        organizationId: testId('org'),
        userId: testId('user'),
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(prisma.persona.create).not.toHaveBeenCalled();
  });

  it('maps a unique-handle Prisma conflict to a validation error', async () => {
    prisma.persona.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        constraint: 'personas_org_brand_handle_live_key',
        target: ['handle'],
      },
    });

    await expect(
      service.create({
        brandId: testId('brand'),
        handle: 'anna',
        label: 'Anna',
        organizationId: testId('org'),
        userId: testId('user'),
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });
  it('reuses a completed brand image as the character reference', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
    const create = vi
      .spyOn(service, 'create')
      .mockResolvedValue({ id: 'persona-1' } as Awaited<
        ReturnType<PersonasService['create']>
      >);
    await service.createFromApprovedSheet({
      assetId: 'image-1',
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      handle: 'anna',
      label: 'Anna',
    });
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'image-1',
          brandId: 'brand-1',
          organizationId: 'org-1',
          isDeleted: false,
          category: { in: ['IMAGE', 'IMAGE_EDIT'] },
          status: { in: ['GENERATED', 'UPLOADED', 'VALIDATED'] },
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarIngredientId: 'image-1',
        handle: 'anna',
      }),
    );
  });
  it('rejects missing, deleted, foreign-brand or unfinished source images before saving', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    const create = vi.spyOn(service, 'create');
    await expect(
      service.createFromApprovedSheet({
        assetId: 'foreign-image',
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
        handle: 'anna',
        label: 'Anna',
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(create).not.toHaveBeenCalled();
  });
});
