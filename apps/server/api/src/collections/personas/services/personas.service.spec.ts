import { PersonasService } from '@api/collections/personas/services/personas.service';
import { brandAvailabilityWhere } from '@api/collections/personas/utils/persona-availability.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PersonasService', () => {
  let service: PersonasService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    brand: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    ingredient: { findFirst: ReturnType<typeof vi.fn> };
    member: { findFirst: ReturnType<typeof vi.fn> };
    persona: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    personaAvailabilityAudit: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: vi.fn(),
      brand: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      ingredient: { findFirst: vi.fn() },
      member: { findFirst: vi.fn() },
      persona: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      personaAvailabilityAudit: { create: vi.fn() },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

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

  it('resolves brand-scoped character handles to canonical stills', async () => {
    prisma.persona.findMany.mockResolvedValue([
      { avatarIngredientId: 'character-1', handle: 'anna' },
    ]);

    await expect(
      service.resolveCharacterHandles({
        brandId: 'brand-1',
        handles: ['Anna', 'anna'],
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      resolvedIngredientIds: ['character-1'],
      unresolvedHandles: [],
    });
    expect(prisma.persona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [brandAvailabilityWhere('brand-1')],
          handle: { in: ['anna'] },
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('names handles that are missing or have no canonical still', async () => {
    prisma.persona.findMany.mockResolvedValue([
      { avatarIngredientId: null, handle: 'blank' },
    ]);

    await expect(
      service.resolveCharacterHandles({
        brandId: 'brand-1',
        handles: ['blank', 'ghost'],
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      resolvedIngredientIds: [],
      unresolvedHandles: ['blank', 'ghost'],
    });
  });

  describe('brand availability (#6009)', () => {
    const orgId = 'org-1';
    const adminMember = { role: { key: 'owner' } };
    const ownedPersona = {
      availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
      availableBrandIds: [] as string[],
      brandId: 'brand-a',
      handle: 'anna',
      id: 'persona-1',
      organizationId: orgId,
    };

    it('lists mentions owned by the brand, shared to all brands, or listing it', async () => {
      prisma.persona.findMany.mockResolvedValue([
        {
          avatarIngredientId: 'img-1',
          handle: 'anna',
          id: 'p1',
          label: 'Anna',
        },
      ]);

      await service.listCharacterMentions({
        brandId: 'brand-b',
        organizationId: orgId,
      });

      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { brandId: 'brand-b' },
                  { availabilityMode: PersonaAvailabilityMode.ALL_BRANDS },
                  {
                    availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
                    availableBrandIds: { has: 'brand-b' },
                  },
                ],
              },
            ],
            isDeleted: false,
            organizationId: orgId,
          }),
        }),
      );
    });

    it('defaults new characters to the owning brand only', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
      const create = vi
        .spyOn(service, 'create')
        .mockResolvedValue({ id: 'persona-1' } as Awaited<
          ReturnType<PersonasService['create']>
        >);

      await service.createFromApprovedSheet({
        assetId: 'image-1',
        brandId: 'brand-a',
        handle: 'anna',
        label: 'Anna',
        organizationId: orgId,
        userId: 'user-1',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
          availableBrandIds: [],
        }),
      );
      expect(prisma.member.findFirst).not.toHaveBeenCalled();
    });

    it('applies an all-brands choice at creation for an admin', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
      prisma.member.findFirst.mockResolvedValue(adminMember);
      prisma.brand.findMany.mockResolvedValue([
        { id: 'brand-a' },
        { id: 'brand-b' },
      ]);
      const create = vi
        .spyOn(service, 'create')
        .mockResolvedValue({ id: 'persona-1' } as Awaited<
          ReturnType<PersonasService['create']>
        >);

      await service.createFromApprovedSheet({
        assetId: 'image-1',
        availability: { mode: PersonaAvailabilityMode.ALL_BRANDS },
        brandId: 'brand-a',
        handle: 'anna',
        label: 'Anna',
        organizationId: orgId,
        userId: 'user-1',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        }),
      );
    });

    it('refuses sharing at creation for a member who is not owner or admin', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
      prisma.member.findFirst.mockResolvedValue({ role: { key: 'creator' } });
      const create = vi.spyOn(service, 'create');

      await expect(
        service.createFromApprovedSheet({
          assetId: 'image-1',
          availability: { mode: PersonaAvailabilityMode.ALL_BRANDS },
          brandId: 'brand-a',
          handle: 'anna',
          label: 'Anna',
          organizationId: orgId,
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a new handle that a shared character already uses in the brand', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'image-1' });
      prisma.persona.findMany.mockResolvedValue([
        {
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          availableBrandIds: [],
          brandId: 'brand-b',
        },
      ]);
      prisma.brand.findMany.mockResolvedValue([
        { id: 'brand-a', label: 'Personal' },
        { id: 'brand-b', label: 'Podcast' },
      ]);
      const create = vi.spyOn(service, 'create');

      await expect(
        service.createFromApprovedSheet({
          assetId: 'image-1',
          brandId: 'brand-a',
          handle: 'anna',
          label: 'Anna',
          organizationId: orgId,
          userId: 'user-1',
        }),
      ).rejects.toThrow(ValidationException);
      expect(create).not.toHaveBeenCalled();
    });

    describe('updateAvailability', () => {
      beforeEach(() => {
        prisma.persona.findFirst.mockResolvedValue(ownedPersona);
        prisma.member.findFirst.mockResolvedValue(adminMember);
        vi.spyOn(service, 'findOne').mockResolvedValue({
          id: 'persona-1',
        } as Awaited<ReturnType<PersonasService['findOne']>>);
      });

      it('shares with every brand and records the audit trail', async () => {
        prisma.brand.findMany.mockResolvedValue([
          { id: 'brand-a' },
          { id: 'brand-b' },
        ]);

        await service.updateAvailability({
          actorUserId: 'actor-1',
          brandId: 'brand-a',
          mode: PersonaAvailabilityMode.ALL_BRANDS,
          organizationId: orgId,
          personaId: 'persona-1',
        });

        expect(prisma.persona.update).toHaveBeenCalledWith({
          data: {
            availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
            availableBrandIds: [],
          },
          where: { id: 'persona-1' },
        });
        expect(prisma.personaAvailabilityAudit.create).toHaveBeenCalledWith({
          data: {
            actorUserId: 'actor-1',
            newBrandIds: [],
            newMode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
            previousBrandIds: [],
            previousMode: PersonaAvailabilityMode.OWNING_BRAND,
          },
        });
      });

      it('selected brands always include the owning brand', async () => {
        prisma.brand.findMany.mockResolvedValue([{ id: 'brand-b' }]);

        await service.updateAvailability({
          actorUserId: 'actor-1',
          brandId: 'brand-a',
          brandIds: ['brand-b'],
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
          organizationId: orgId,
          personaId: 'persona-1',
        });

        expect(prisma.persona.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
              availableBrandIds: ['brand-a', 'brand-b'],
            },
          }),
        );
      });

      it('restricting back to the owning brand clears the brand list', async () => {
        prisma.persona.findFirst.mockResolvedValue({
          ...ownedPersona,
          availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          availableBrandIds: ['brand-a', 'brand-b'],
        });

        await service.updateAvailability({
          actorUserId: 'actor-1',
          brandId: 'brand-a',
          mode: PersonaAvailabilityMode.OWNING_BRAND,
          organizationId: orgId,
          personaId: 'persona-1',
        });

        expect(prisma.persona.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
              availableBrandIds: [],
            },
          }),
        );
        expect(prisma.personaAvailabilityAudit.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            previousBrandIds: ['brand-a', 'brand-b'],
            previousMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          }),
        });
      });

      it('rejects a brand outside the organization', async () => {
        prisma.brand.findMany.mockResolvedValue([]);

        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            brandIds: ['foreign-brand'],
            mode: PersonaAvailabilityMode.SELECTED_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(ValidationException);
        expect(prisma.persona.update).not.toHaveBeenCalled();
      });

      it('rejects selected brands without any brand', async () => {
        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            brandIds: [],
            mode: PersonaAvailabilityMode.SELECTED_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(ValidationException);
      });

      it('rejects a handle collision and names the handle', async () => {
        prisma.persona.findMany.mockResolvedValue([
          {
            availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
            availableBrandIds: [],
            brandId: 'brand-b',
          },
        ]);
        prisma.brand.findMany.mockResolvedValue([
          { id: 'brand-a', label: 'Personal' },
          { id: 'brand-b', label: 'Podcast' },
        ]);

        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toThrow(ValidationException);
        expect(prisma.persona.update).not.toHaveBeenCalled();
        await service
          .updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          })
          .catch((error: ValidationException) => {
            expect(JSON.stringify(error.getResponse())).toContain('@anna');
            expect(JSON.stringify(error.getResponse())).toContain('Podcast');
          });
      });

      it('refuses a member who is not an organization owner or admin', async () => {
        prisma.member.findFirst.mockResolvedValue({ role: { key: 'creator' } });

        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.persona.update).not.toHaveBeenCalled();
      });

      it('answers not-found for a character the active brand cannot see', async () => {
        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-c',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.member.findFirst).not.toHaveBeenCalled();
      });

      it('answers not-found for a character in another organization', async () => {
        prisma.persona.findFirst.mockResolvedValue(null);

        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: 'other-org',
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.persona.findFirst).toHaveBeenCalledWith({
          where: expect.objectContaining({
            isDeleted: false,
            organizationId: 'other-org',
          }),
        });
      });
    });

    it('finds a character only for brands it is available to', async () => {
      prisma.persona.findFirst.mockResolvedValue({
        ...ownedPersona,
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand-a', 'brand-b'],
      });

      await expect(
        service.findAvailableToBrand({
          brandId: 'brand-b',
          organizationId: orgId,
          personaId: 'persona-1',
        }),
      ).resolves.toMatchObject({ id: 'persona-1' });
      await expect(
        service.findAvailableToBrand({
          brandId: 'brand-c',
          organizationId: orgId,
          personaId: 'persona-1',
        }),
      ).resolves.toBeNull();
    });

    it('summarizes brand counts for shared characters', async () => {
      prisma.brand.count.mockResolvedValue(4);

      const docs = await service.withAvailabilitySummary(
        [
          {
            ...ownedPersona,
            availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          },
          {
            ...ownedPersona,
            availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
            availableBrandIds: ['brand-a', 'brand-b'],
            brand: { label: 'Personal' },
          },
          ownedPersona,
        ] as unknown as Parameters<
          PersonasService['withAvailabilitySummary']
        >[0],
        orgId,
      );

      expect(
        docs.map((doc) => [doc.isShared, doc.availableBrandCount]),
      ).toEqual([
        [true, 4],
        [true, 2],
        [false, 1],
      ]);
      expect(docs[1]?.owningBrandName).toBe('Personal');
      expect(prisma.brand.count).toHaveBeenCalledTimes(1);
    });
  });
});
