import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
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
  const grantReads = {
    findForBrand: vi.fn(),
    findHandleGrants: vi.fn(),
    findLinkedOutputs: vi.fn(),
    findReferenceGrants: vi.fn(),
    listForBrand: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
    brand: {
      count: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    ingredient: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    member: { findFirst: ReturnType<typeof vi.fn> };
    persona: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    personaAvailabilityAudit: { create: ReturnType<typeof vi.fn> };
    personaGrant: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    grantReads.findForBrand.mockReset().mockResolvedValue(null);
    grantReads.findHandleGrants.mockReset().mockResolvedValue([]);
    grantReads.findReferenceGrants.mockReset().mockResolvedValue([]);
    grantReads.findLinkedOutputs.mockReset().mockResolvedValue([]);
    grantReads.listForBrand.mockReset().mockResolvedValue([]);
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(),
      brand: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'brand-a' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      ingredient: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      member: { findFirst: vi.fn() },
      persona: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      personaAvailabilityAudit: { create: vi.fn() },
      personaGrant: { findMany: vi.fn().mockResolvedValue([]) },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonasService,
        { provide: PersonaGrantReadService, useValue: grantReads },
        { provide: PrismaService, useValue: prisma },
        {
          provide: LoggerService,
          useValue: logger,
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
      expect(prisma.persona.create).not.toHaveBeenCalled();
    });

    it('rejects a generic create whose handle collides with a shared character (#6009)', async () => {
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

      await expect(
        service.create({
          brandId: 'brand-a',
          handle: 'anna',
          label: 'Anna',
          organizationId: orgId,
          userId: 'user-1',
        }),
      ).rejects.toThrow(ValidationException);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.persona.create).not.toHaveBeenCalled();
    });

    it('rejects renaming a shared character onto a handle another brand already uses (#6009)', async () => {
      prisma.persona.findFirst.mockResolvedValue({
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: ['brand-a', 'brand-b'],
        brandId: 'brand-a',
        organizationId: orgId,
      });
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
      const update = vi.fn();
      (prisma.persona as unknown as { update: typeof update }).update = update;

      await expect(
        service.patch('persona-1', {
          handle: 'Ben',
          organizationId: orgId,
        }),
      ).rejects.toThrow(ValidationException);
      expect(prisma.persona.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'persona-1', isDeleted: false, organizationId: orgId },
        }),
      );
      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            handle: 'ben',
            id: { not: 'persona-1' },
          }),
        }),
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a handle change that carries no organization', async () => {
      const update = vi.fn();
      (prisma.persona as unknown as { update: typeof update }).update = update;

      await expect(
        service.patch('persona-1', { handle: 'Ben' }),
      ).rejects.toThrow(ValidationException);
      expect(prisma.persona.findFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('answers not-found for a handle change on another organization character', async () => {
      prisma.persona.findFirst.mockResolvedValue(null);
      const update = vi.fn();
      (prisma.persona as unknown as { update: typeof update }).update = update;

      await expect(
        service.patch('persona-1', {
          handle: 'Ben',
          organizationId: orgId,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    describe('updateAvailability', () => {
      it('refuses to share once the owning brand deletion won the lock', async () => {
        prisma.brand.findFirst.mockResolvedValue(null);
        prisma.brand.findMany.mockResolvedValue([{ id: 'brand-b' }]);

        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            brandId: 'brand-a',
            brandIds: ['brand-b'],
            mode: PersonaAvailabilityMode.SELECTED_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.persona.update).not.toHaveBeenCalled();
      });

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
          where: { id: 'persona-1', isDeleted: false, organizationId: 'org-1' },
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

      it('caps an owner-issued API key without the admin scope', async () => {
        await expect(
          service.updateAvailability({
            actorUserId: 'actor-1',
            apiKeyContext: { isApiKey: true, scopes: ['read'] },
            brandId: 'brand-a',
            mode: PersonaAvailabilityMode.ALL_BRANDS,
            organizationId: orgId,
            personaId: 'persona-1',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.persona.update).not.toHaveBeenCalled();
      });

      it('lets an owner-issued API key with the admin scope share', async () => {
        prisma.brand.findMany.mockResolvedValue([{ id: 'brand-a' }]);

        await service.updateAvailability({
          actorUserId: 'actor-1',
          apiKeyContext: { isApiKey: true, scopes: ['admin'] },
          brandId: 'brand-a',
          mode: PersonaAvailabilityMode.ALL_BRANDS,
          organizationId: orgId,
          personaId: 'persona-1',
        });

        expect(prisma.persona.update).toHaveBeenCalled();
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

    it('serializes concurrent sharing so two same-handle characters cannot both reach a brand', async () => {
      const store = new Map<string, Record<string, unknown>>([
        [
          'persona-x',
          {
            availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
            availableBrandIds: [],
            brandId: 'brand-a',
            handle: 'anna',
            id: 'persona-x',
            organizationId: orgId,
          },
        ],
        [
          'persona-y',
          {
            availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
            availableBrandIds: [],
            brandId: 'brand-b',
            handle: 'anna',
            id: 'persona-y',
            organizationId: orgId,
          },
        ],
      ]);
      let tail: Promise<unknown> = Promise.resolve();
      // Models the per-organization advisory lock: transactions run one at a time.
      prisma.$transaction.mockImplementation(
        (callback: (tx: typeof prisma) => Promise<unknown>) => {
          const run = tail.then(async () => {
            await Promise.resolve();
            return callback(prisma);
          });
          tail = run.catch(() => undefined);
          return run;
        },
      );
      prisma.persona.findFirst.mockImplementation(
        async ({ where }: { where: { id: string } }) =>
          store.get(where.id) ?? null,
      );
      prisma.persona.findMany.mockImplementation(
        async ({ where }: { where: { handle: string; id: { not: string } } }) =>
          [...store.values()].filter(
            (row) => row.handle === where.handle && row.id !== where.id.not,
          ),
      );
      prisma.persona.update.mockImplementation(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { id: string };
        }) => {
          store.set(where.id, { ...store.get(where.id), ...data });
        },
      );
      const orgBrands = [
        { id: 'brand-a', label: 'A' },
        { id: 'brand-b', label: 'B' },
        { id: 'brand-c', label: 'C' },
      ];
      prisma.brand.findMany.mockImplementation(
        async ({ where }: { where: { id?: { in: string[] } } }) =>
          where.id
            ? orgBrands.filter((brand) => where.id?.in.includes(brand.id))
            : orgBrands,
      );
      prisma.member.findFirst.mockResolvedValue(adminMember);
      vi.spyOn(service, 'findOne').mockResolvedValue({
        id: 'x',
      } as Awaited<ReturnType<PersonasService['findOne']>>);

      const results = await Promise.allSettled([
        service.updateAvailability({
          actorUserId: 'actor-1',
          brandId: 'brand-a',
          brandIds: ['brand-c'],
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
          organizationId: orgId,
          personaId: 'persona-x',
        }),
        service.updateAvailability({
          actorUserId: 'actor-1',
          brandId: 'brand-b',
          brandIds: ['brand-c'],
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
          organizationId: orgId,
          personaId: 'persona-y',
        }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const shared = [...store.values()].filter(
        (row) =>
          row.availabilityMode === PersonaAvailabilityMode.SELECTED_BRANDS,
      );
      expect(shared).toHaveLength(1);
    });

    describe('resolveCharacterReferences', () => {
      const avatarRow = (overrides: Record<string, unknown>) => ({
        availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
        availableBrandIds: [],
        avatarIngredientId: 'img-1',
        brandId: 'brand-a',
        id: 'persona-1',
        ingredients: [],
        ...overrides,
      });
      const outputRow = (overrides: Record<string, unknown>) =>
        avatarRow({
          avatarIngredientId: 'avatar-x',
          ingredients: [{ id: 'video-1' }],
          ...overrides,
        });
      const admit = (
        ingredientIds: string[],
        brandId: string | null = 'brand-b',
      ) =>
        service.resolveCharacterReferences({
          brandId,
          ingredientIds,
          organizationId: orgId,
          path: 'video',
        });

      it('returns no character for ordinary references with one indexed query', async () => {
        prisma.persona.findMany.mockResolvedValue([]);

        const admission = await admit(['asset-1']);

        expect(admission.availableAvatarIds).toEqual(new Set());
        expect(admission.personaId).toBeNull();
        expect(prisma.persona.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.persona.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [
                { avatarIngredientId: { in: ['asset-1'] } },
                { ingredients: { some: { id: { in: ['asset-1'] } } } },
              ],
              isDeleted: false,
              organizationId: orgId,
            }),
          }),
        );
      });

      it('skips the query when there is nothing to admit', async () => {
        await expect(admit([])).resolves.toMatchObject({ personaId: null });
        expect(prisma.persona.findMany).not.toHaveBeenCalled();
      });

      it('allows a shared character reference and links its character', async () => {
        prisma.persona.findMany.mockResolvedValue([
          avatarRow({ availabilityMode: PersonaAvailabilityMode.ALL_BRANDS }),
        ]);

        const admission = await admit(['img-1']);

        expect(admission.availableAvatarIds).toEqual(new Set(['img-1']));
        expect(admission.personaId).toBe('persona-1');
      });

      it('rejects a character reference once the brand lost access and logs it', async () => {
        prisma.persona.findMany.mockResolvedValue([
          avatarRow({
            availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
            availableBrandIds: ['brand-a'],
          }),
        ]);

        await expect(admit(['img-1'])).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(logger.warn).toHaveBeenCalledWith(
          'Character reference refused',
          expect.objectContaining({
            assetId: 'img-1',
            brandId: 'brand-b',
            path: 'video',
            personaIds: ['persona-1'],
          }),
        );
      });

      it('refuses when there is no active brand', async () => {
        prisma.persona.findMany.mockResolvedValue([
          avatarRow({ availabilityMode: PersonaAvailabilityMode.ALL_BRANDS }),
        ]);

        await expect(admit(['img-1'], null)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('refuses an output linked to a character the brand lost', async () => {
        prisma.persona.findMany.mockResolvedValue([outputRow({})]);

        await expect(admit(['video-1'])).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('links an output of a character the brand can still use', async () => {
        prisma.persona.findMany.mockResolvedValue([
          outputRow({ availabilityMode: PersonaAvailabilityMode.ALL_BRANDS }),
        ]);

        const admission = await admit(['video-1']);

        expect(admission.personaId).toBe('persona-1');
        expect(admission.personaIdByAssetId.get('video-1')).toBe('persona-1');
        expect(admission.availableAvatarIds.size).toBe(0);
      });

      it('ignores outputs linked to a character with no owning brand', async () => {
        prisma.persona.findMany.mockResolvedValue([
          outputRow({ brandId: null }),
        ]);

        await expect(admit(['video-1'])).resolves.toMatchObject({
          personaId: null,
        });
      });
    });

    describe('character handles fail closed', () => {
      it('resolves nothing without an active brand', async () => {
        await expect(
          service.resolveCharacterHandles({
            brandId: null,
            handles: ['anna'],
            organizationId: orgId,
          }),
        ).resolves.toEqual({
          resolvedIngredientIds: [],
          unresolvedHandles: ['anna'],
        });
        expect(prisma.persona.findMany).not.toHaveBeenCalled();
      });

      it('logs a refused handle with its path and brand', async () => {
        prisma.persona.findMany.mockResolvedValue([]);

        await service.resolveCharacterHandles({
          brandId: 'brand-b',
          handles: ['anna'],
          organizationId: orgId,
          path: 'video-clip-chain',
        });

        expect(logger.warn).toHaveBeenCalledWith(
          'Character handle refused',
          expect.objectContaining({
            brandId: 'brand-b',
            handles: ['anna'],
            path: 'video-clip-chain',
          }),
        );
      });
    });

    describe('characters granted by another organization (#6037)', () => {
      const grantedRow = (overrides: Record<string, unknown> = {}) => ({
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        availableBrandIds: [] as string[],
        ownerOrganizationId: 'org-owner',
        persona: {
          avatarIngredientId: 'avatar-g',
          id: 'persona-g',
          ingredients: [] as Array<{ id: string }>,
        },
        ...overrides,
      });
      const admit = (ids: string[]) =>
        service.resolveCharacterReferences({
          brandId: 'brand-b',
          ingredientIds: ids,
          organizationId: orgId,
          path: 'image',
        });

      it('admits a granted character reference and names its owning organization', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([grantedRow()]);

        const admission = await admit(['avatar-g']);

        expect(admission.personaId).toBe('persona-g');
        expect(admission.availableAvatarIds).toEqual(new Set(['avatar-g']));
        expect(admission.grantedAvatarOwners.get('avatar-g')).toBe('org-owner');
        expect(grantReads.findReferenceGrants).toHaveBeenCalledWith({
          ingredientIds: ['avatar-g'],
          organizationId: orgId,
        });
      });

      it('refuses a granted character the receiving brand was not granted', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([
          grantedRow({
            availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
            availableBrandIds: ['brand-other'],
          }),
        ]);

        await expect(admit(['avatar-g'])).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('treats a missing grant like any other unlinked asset', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([]);

        const admission = await admit(['avatar-g', 'old-output']);

        expect(admission.personaId).toBeNull();
        expect(admission.grantedAvatarOwners.size).toBe(0);
      });

      it('refuses an output linked to a character whose grant was revoked', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([]);
        grantReads.findLinkedOutputs.mockResolvedValue([
          { id: 'old-output', personaId: 'persona-revoked' },
        ]);

        await expect(admit(['old-output'])).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('admits a linked output whose character is currently available', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([
          grantedRow({
            persona: {
              avatarIngredientId: 'avatar-g',
              id: 'persona-g',
              ingredients: [{ id: 'out-1' }],
            },
          }),
        ]);
        grantReads.findLinkedOutputs.mockResolvedValue([
          { id: 'out-1', personaId: 'persona-g' },
        ]);

        const admission = await admit(['out-1']);

        expect(admission.personaIdByAssetId.get('out-1')).toBe('persona-g');
      });

      it('links an output of a granted character the brand can use', async () => {
        grantReads.findReferenceGrants.mockResolvedValue([
          grantedRow({
            persona: {
              avatarIngredientId: 'avatar-g',
              id: 'persona-g',
              ingredients: [{ id: 'out-1' }],
            },
          }),
        ]);

        const admission = await admit(['out-1']);

        expect(admission.personaIdByAssetId.get('out-1')).toBe('persona-g');
        expect(admission.availableAvatarIds.size).toBe(0);
      });

      it('resolves a granted handle to its reference image', async () => {
        prisma.persona.findMany.mockResolvedValue([]);
        grantReads.findHandleGrants.mockResolvedValue([
          { persona: { avatarIngredientId: 'avatar-g', handle: 'Anna' } },
        ]);

        await expect(
          service.resolveCharacterHandles({
            brandId: 'brand-b',
            handles: ['anna'],
            organizationId: orgId,
          }),
        ).resolves.toEqual({
          resolvedIngredientIds: ['avatar-g'],
          unresolvedHandles: [],
        });
      });

      it('lists granted characters in mentions with the granting organization', async () => {
        prisma.persona.findMany.mockResolvedValue([]);
        grantReads.listForBrand.mockResolvedValue([
          {
            ownerOrganization: { label: 'Vincent' },
            persona: {
              avatarIngredientId: 'avatar-g',
              handle: 'anna',
              id: 'persona-g',
              label: 'Anna',
            },
          },
        ]);

        const mentions = await service.listCharacterMentions({
          brandId: 'brand-b',
          organizationId: orgId,
        });

        expect(mentions).toEqual([
          expect.objectContaining({
            grantedByOrganizationName: 'Vincent',
            handle: 'anna',
            hasReferenceImage: true,
            isGranted: true,
          }),
        ]);
      });

      it('resolves a granted character for the Library filter only through its grant', async () => {
        prisma.persona.findFirst.mockResolvedValue(null);
        grantReads.findForBrand.mockResolvedValue({ id: 'persona-g' });

        await expect(
          service.findAvailableToBrand({
            brandId: 'brand-b',
            organizationId: orgId,
            personaId: 'persona-g',
          }),
        ).resolves.toMatchObject({ id: 'persona-g' });

        grantReads.findForBrand.mockResolvedValue(null);
        await expect(
          service.findAvailableToBrand({
            brandId: 'brand-b',
            organizationId: orgId,
            personaId: 'persona-g',
          }),
        ).resolves.toBeNull();
      });

      it('rejects a handle that collides with a character granted into the target brand', async () => {
        prisma.persona.findMany.mockResolvedValue([]);
        prisma.personaGrant.findMany.mockResolvedValue([
          {
            availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
            availableBrandIds: [],
          },
        ]);
        prisma.brand.findMany.mockResolvedValue([
          { id: 'brand-b', label: 'Podcast' },
        ]);

        await expect(
          service.assertNoHandleCollision({
            availability: {
              availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
              availableBrandIds: [],
              brandId: 'brand-b',
            },
            handle: 'anna',
            organizationId: orgId,
            owningBrandId: 'brand-b',
          }),
        ).rejects.toBeInstanceOf(ValidationException);
      });
    });

    it('includes the shared summary in mention results', async () => {
      prisma.brand.count.mockResolvedValue(3);
      prisma.persona.findMany.mockResolvedValue([
        {
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          availableBrandIds: [],
          avatarIngredientId: 'img-1',
          brand: { label: 'Podcast' },
          brandId: 'brand-b',
          handle: 'anna',
          id: 'p1',
          label: 'Anna',
        },
        {
          availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
          availableBrandIds: [],
          avatarIngredientId: null,
          brand: { label: 'Personal' },
          brandId: 'brand-a',
          handle: 'ben',
          id: 'p2',
          label: 'Ben',
        },
      ]);

      const mentions = await service.listCharacterMentions({
        brandId: 'brand-a',
        organizationId: orgId,
      });

      expect(mentions[0]).toMatchObject({
        availableBrandCount: 3,
        isShared: true,
        owningBrandName: 'Podcast',
      });
      expect(mentions[1]).toMatchObject({
        availableBrandCount: 1,
        isShared: false,
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
