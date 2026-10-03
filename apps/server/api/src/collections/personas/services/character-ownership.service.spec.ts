import { CharacterOwnershipService } from '@api/collections/personas/services/character-ownership.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('CharacterOwnershipService', () => {
  let ownership: CharacterOwnershipService;
  let personas: PersonasService;
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
    brand: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    member: { findFirst: ReturnType<typeof vi.fn> };
    persona: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    personaAvailabilityAudit: { create: ReturnType<typeof vi.fn> };
  };
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

  beforeEach(async () => {
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(),
      brand: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      member: { findFirst: vi.fn() },
      persona: {
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
        CharacterOwnershipService,
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
    ownership = module.get(CharacterOwnershipService);
    personas = module.get(PersonasService);
  });

  describe('moveOwnership', () => {
    const shared = {
      ...ownedPersona,
      availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
      availableBrandIds: ['brand-a', 'brand-b'],
    };
    const move = (overrides: Record<string, unknown> = {}) =>
      ownership.moveOwnership({
        actorUserId: 'actor-1',
        brandId: 'brand-a',
        organizationId: orgId,
        personaId: 'persona-1',
        targetBrandId: 'brand-b',
        ...overrides,
      });

    beforeEach(() => {
      prisma.persona.findFirst.mockResolvedValue(shared);
      prisma.member.findFirst.mockResolvedValue(adminMember);
      prisma.brand.findMany.mockResolvedValue([
        { id: 'brand-a', label: 'A' },
        { id: 'brand-b', label: 'B' },
      ]);
      vi.spyOn(personas, 'findOne').mockResolvedValue({
        id: 'persona-1',
      } as Awaited<ReturnType<PersonasService['findOne']>>);
    });

    it('moves the owning brand, keeps availability and records the change', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand-b' });

      await move();

      expect(prisma.persona.update).toHaveBeenCalledWith({
        data: { brandId: 'brand-b' },
        where: { id: 'persona-1', isDeleted: false, organizationId: orgId },
      });
      expect(prisma.personaAvailabilityAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'actor-1',
          newMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          newOwningBrand: 'brand-b',
          previousOwningBrand: 'brand-a',
        }),
      });
    });

    it('refuses a non-admin', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: { key: 'creator' } });

      await expect(move()).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.persona.update).not.toHaveBeenCalled();
    });

    it('refuses a target outside the availability or organization', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand-c' });

      await expect(move({ targetBrandId: 'brand-c' })).rejects.toBeInstanceOf(
        ValidationException,
      );

      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(move()).rejects.toBeInstanceOf(ValidationException);
      expect(prisma.persona.update).not.toHaveBeenCalled();
    });

    it('leaves an owning-brand-only character to the edit flow', async () => {
      prisma.persona.findFirst.mockResolvedValue(ownedPersona);
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand-b' });

      await expect(move()).rejects.toBeInstanceOf(ValidationException);
    });

    it('is not found for a brand that cannot use the character', async () => {
      await expect(move({ brandId: 'brand-z' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
