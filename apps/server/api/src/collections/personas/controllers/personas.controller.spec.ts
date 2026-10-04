import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_data, _serializer) => ({ data: _data })),
}));

import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { CharacterOwnershipService } from '@api/collections/personas/services/character-ownership.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { brandAvailabilityWhere } from '@api/collections/personas/utils/persona-availability.util';
import { ValidationException } from '@api/exceptions/validation.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PersonaAvailabilityMode, PersonaStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const brandId = testId('brand');
const organizationId = testId('org');
const userId = testId('user');
const personaId = testId('persona');
const assignedPersonaId = testId('persona', 2);
const memberId1 = testId('member', 1);
const memberId2 = testId('member', 2);

describe('PersonasController', () => {
  let controller: PersonasController;

  const mockUser: AuthenticatedUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  };

  const mockServiceMethods = {
    assertCanManageSharing: vi.fn(),
    assignMembers: vi.fn(),
    create: vi.fn(),
    createFromApprovedSheet: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    listCharacterMentions: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    updateAvailability: vi.fn(),
    withAvailabilitySummary: vi.fn(),
  };

  const ownershipMethods = { moveOwnership: vi.fn() };

  beforeEach(async () => {
    mockServiceMethods.withAvailabilitySummary.mockImplementation(
      async (docs: unknown[]) => docs,
    );
    mockServiceMethods.assertCanManageSharing.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonasController],
      providers: [
        { provide: PersonasService, useValue: mockServiceMethods },
        { provide: CharacterOwnershipService, useValue: ownershipMethods },
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
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PersonasController>(PersonasController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('patch (member assignment)', () => {
    const mockRequest = {
      get: vi.fn().mockReturnValue('localhost'),
      headers: {},
      path: `/personas/${personaId}`,
      protocol: 'https',
      query: {},
    } as unknown as Request;

    it('should assign members to a persona when memberIds is present', async () => {
      const mockPersona = {
        id: assignedPersonaId,
        name: 'Test Persona',
      };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId,
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        memberIds: [memberId1, memberId2],
      };

      await controller.patch(mockRequest, mockUser, personaId, body);

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        personaId,
        [memberId1, memberId2],
        organizationId,
      );
    });

    it('should still apply remaining fields via the base patch when provided alongside memberIds', async () => {
      const mockPersona = {
        id: assignedPersonaId,
        name: 'Test Persona',
      };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId,
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        label: 'Renamed Persona',
        memberIds: [memberId1],
      };

      await controller.patch(mockRequest, mockUser, personaId, body);

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        personaId,
        [memberId1],
        organizationId,
      );
      const patchArg = mockServiceMethods.patch.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patchArg.memberIds).toBeUndefined();
      expect(patchArg.label).toBe('Renamed Persona');
    });

    it('stamps the caller organization on the update so handle checks stay scoped', async () => {
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId,
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue({ id: personaId });

      await controller.patch(mockRequest, mockUser, personaId, {
        handle: 'ben',
        organizationId: 'client-supplied-org',
      } as UpdatePersonaDto);

      const patchArg = mockServiceMethods.patch.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(patchArg.organizationId).toBe(organizationId);
    });

    it('answers 404 when the creator patches their own unshared character in another organization', async () => {
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId: 'other-organization',
        userId,
      });

      expect(
        controller.canUserModifyEntity(mockUser, {
          id: personaId,
          organizationId: 'other-organization',
          userId,
        } as PersonaDocument),
      ).toBe(false);
      await expect(
        controller.patch(mockRequest, mockUser, personaId, { handle: 'ben' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(mockServiceMethods.patch).not.toHaveBeenCalled();
    });

    it('assigns members whose user IDs are legacy Better Auth IDs', async () => {
      // Legacy base62 user IDs fail every Genfeed entity-id shape (#5410).
      const legacyUserId = 'LegacyBetterAuthUserIdBase62Abcd';
      mockServiceMethods.assignMembers.mockResolvedValue({ id: personaId });
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId,
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue({ id: personaId });

      await controller.patch(mockRequest, mockUser, personaId, {
        memberIds: [legacyUserId],
      });

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        personaId,
        [legacyUserId],
        organizationId,
      );
    });

    it('rejects a blank member user ID', async () => {
      await expect(
        controller.patch(mockRequest, mockUser, personaId, {
          memberIds: ['  '],
        }),
      ).rejects.toMatchObject({
        response: { detail: 'memberIds[0] cannot be empty' },
      });
      expect(mockServiceMethods.assignMembers).not.toHaveBeenCalled();
    });

    it('should propagate errors from the assignment call', async () => {
      mockServiceMethods.assignMembers.mockRejectedValue(new Error('DB error'));
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        organizationId,
        userId,
      });

      await expect(
        controller.patch(mockRequest, mockUser, personaId, {
          memberIds: [memberId1],
        }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('composeSheetPrompt', () => {
    it('returns the server-composed character sheet preset', async () => {
      const result = await controller.composeSheetPrompt(mockUser, {
        description: 'a tall woman in a red coat',
        isNonHumanoid: false,
      });

      expect(result.prompt).toContain('CHARACTER REFERENCE SHEET PRESET');
      expect(result.prompt).toContain(
        '<<<CHARACTER_DESCRIPTION>>>a tall woman in a red coat<<<END_CHARACTER_DESCRIPTION>>>',
      );
    });
  });

  describe('createFromSheet', () => {
    const request = { headers: {} } as unknown as Request;

    it('creates a persona from an approved sheet', async () => {
      mockServiceMethods.createFromApprovedSheet.mockResolvedValue({
        handle: 'anna',
        id: personaId,
        label: 'Anna',
      });

      const result = await controller.createFromSheet(request, mockUser, {
        assetId: testId('asset'),
        handle: 'anna',
        label: 'Anna',
      });

      expect(mockServiceMethods.createFromApprovedSheet).toHaveBeenCalledWith({
        assetId: testId('asset'),
        apiKeyContext: mockUser,
        availability: undefined,
        brandId,
        isSuperAdmin: false,
        handle: 'anna',
        label: 'Anna',
        organizationId,
        userId,
      });
      expect(result).toEqual({
        data: { handle: 'anna', id: personaId, label: 'Anna' },
      });
    });
  });

  describe('getMentions', () => {
    it('returns brand-scoped character mentions', async () => {
      mockServiceMethods.listCharacterMentions.mockResolvedValue([
        {
          handle: 'anna',
          hasReferenceImage: true,
          id: personaId,
          label: 'Anna',
        },
      ]);

      const result = await controller.getMentions(mockUser, 'an');

      expect(mockServiceMethods.listCharacterMentions).toHaveBeenCalledWith({
        brandId,
        organizationId,
        q: 'an',
      });
      expect(result.mentions[0]?.handle).toBe('anna');
    });
  });

  describe('buildFindAllQuery (mention suggestions)', () => {
    it('scopes mentionable suggestions to the caller org/brand and active handles', () => {
      const query = controller.buildFindAllQuery(mockUser, {
        isMentionable: true,
        q: 'an',
      } as never);

      expect(query.where).toMatchObject({
        AND: [brandAvailabilityWhere(brandId)],
        handle: { not: null },
        isDeleted: false,
        organizationId,
        status: PersonaStatus.ACTIVE,
      });
      expect(query.where).toEqual(
        expect.objectContaining({
          OR: [
            { handle: { mode: 'insensitive', startsWith: 'an' } },
            { label: { mode: 'insensitive', startsWith: 'an' } },
          ],
        }),
      );
    });

    it('refuses to search another organization', () => {
      const call = () =>
        controller.buildFindAllQuery(mockUser, {
          isMentionable: true,
          organizationId: testId('org', 9),
          q: 'an',
        } as never);

      expect(call).toThrow(ForbiddenException);
      try {
        call();
        expect.unreachable('expected a ForbiddenException');
      } catch (error) {
        expect((error as ForbiddenException).getResponse()).toEqual({
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        });
      }
    });
  });

  describe('brand availability (#6009)', () => {
    const request = {
      get: vi.fn().mockReturnValue('localhost'),
      headers: {},
      path: `/personas/${personaId}`,
      protocol: 'https',
      query: {},
    } as unknown as Request;
    const otherBrandId = testId('brand', 2);
    const sharedPersona = {
      availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
      availableBrandIds: [],
      brandId: otherBrandId,
      id: personaId,
      organizationId,
      userId: testId('user', 9),
    };

    it('lists characters owned by the brand plus those shared to it', () => {
      const query = controller.buildFindAllQuery(mockUser, {} as never);

      expect(query.where).toMatchObject({
        AND: [brandAvailabilityWhere(brandId)],
        isDeleted: false,
        organizationId,
      });
      expect(query.where).not.toHaveProperty('brandId');
    });

    it('passes the availability choice and super-admin flag when creating from a sheet', async () => {
      mockServiceMethods.createFromApprovedSheet.mockResolvedValue({
        id: personaId,
      });
      const availability = {
        brandIds: [otherBrandId],
        mode: PersonaAvailabilityMode.SELECTED_BRANDS,
      };

      await controller.createFromSheet(request, mockUser, {
        assetId: testId('asset'),
        availability,
        handle: 'anna',
        label: 'Anna',
      });

      expect(mockServiceMethods.createFromApprovedSheet).toHaveBeenCalledWith(
        expect.objectContaining({ availability }),
      );
    });

    it('updates availability for the active brand and organization', async () => {
      mockServiceMethods.updateAvailability.mockResolvedValue(sharedPersona);

      await controller.updateAvailability(request, mockUser, personaId, {
        mode: PersonaAvailabilityMode.ALL_BRANDS,
      });

      expect(mockServiceMethods.updateAvailability).toHaveBeenCalledWith({
        actorUserId: userId,
        apiKeyContext: mockUser,
        brandId,
        brandIds: undefined,
        isSuperAdmin: false,
        mode: PersonaAvailabilityMode.ALL_BRANDS,
        organizationId,
        personaId,
      });
    });

    it('moves ownership for the active brand and organization', async () => {
      ownershipMethods.moveOwnership.mockResolvedValue(sharedPersona);

      await controller.moveOwnership(request, mockUser, personaId, {
        brandId: otherBrandId,
      });

      expect(ownershipMethods.moveOwnership).toHaveBeenCalledWith({
        actorUserId: userId,
        apiKeyContext: mockUser,
        brandId,
        isSuperAdmin: false,
        organizationId,
        personaId,
        targetBrandId: otherBrandId,
      });
    });

    it('lets organization members read a character shared to their brand', () => {
      expect(
        controller.canUserReadEntity(mockUser, {
          ...sharedPersona,
        } as never),
      ).toBe(true);
    });

    it('answers not-found material for a character outside the brand availability', () => {
      expect(
        controller.canUserReadEntity(mockUser, {
          ...sharedPersona,
          availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
          availableBrandIds: [otherBrandId],
        } as never),
      ).toBe(false);
      expect(
        controller.canUserReadEntity(mockUser, {
          ...sharedPersona,
          availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
        } as never),
      ).toBe(false);
      expect(
        controller.canUserReadEntity(mockUser, {
          ...sharedPersona,
          organizationId: testId('org', 9),
        } as never),
      ).toBe(false);
    });

    it('requires owner or admin to edit a shared character', async () => {
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);
      mockServiceMethods.assertCanManageSharing.mockRejectedValue(
        new ForbiddenException('admins only'),
      );

      await expect(
        controller.patch(request, mockUser, personaId, { label: 'Renamed' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockServiceMethods.patch).not.toHaveBeenCalled();
    });

    it('lets an admin edit a shared character they did not create', async () => {
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);
      mockServiceMethods.patch.mockResolvedValue(sharedPersona);

      await controller.patch(request, mockUser, personaId, {
        label: 'Renamed',
      });

      expect(mockServiceMethods.assertCanManageSharing).toHaveBeenCalledWith({
        apiKeyContext: mockUser,
        isSuperAdmin: false,
        organizationId,
        userId,
      });
      expect(mockServiceMethods.patch).toHaveBeenCalled();
    });

    it('does not reveal a shared character the brand cannot see', async () => {
      mockServiceMethods.findOne.mockResolvedValue({
        ...sharedPersona,
        availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
        availableBrandIds: [otherBrandId],
      });

      await expect(
        controller.patch(request, mockUser, personaId, { label: 'Renamed' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(mockServiceMethods.patch).not.toHaveBeenCalled();
    });

    it('does not let a shared character move to another owning brand', async () => {
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);

      await expect(
        controller.patch(request, mockUser, personaId, {
          brandId: brandId,
        } as never),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(mockServiceMethods.patch).not.toHaveBeenCalled();
    });

    it('gates member assignment on a shared character behind owner or admin', async () => {
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);
      mockServiceMethods.assertCanManageSharing.mockRejectedValue(
        new ForbiddenException('admins only'),
      );

      await expect(
        controller.patch(request, mockUser, personaId, {
          memberIds: [memberId1],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockServiceMethods.assignMembers).not.toHaveBeenCalled();
    });

    it('refuses deleting a shared character without owner or admin', async () => {
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);
      mockServiceMethods.assertCanManageSharing.mockRejectedValue(
        new ForbiddenException('admins only'),
      );

      await expect(
        controller.remove(request, mockUser, personaId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockServiceMethods.remove).not.toHaveBeenCalled();
    });

    describe('cross-organization isolation', () => {
      const foreignOrgPersona = {
        ...sharedPersona,
        organizationId: testId('org', 9),
      };

      it('never treats another organization character as modifiable', () => {
        expect(
          controller.canUserModifyEntity(mockUser, foreignOrgPersona as never),
        ).toBe(false);
      });

      it('answers 404 when an admin patches another organization character shared with all brands', async () => {
        mockServiceMethods.findOne.mockResolvedValue(foreignOrgPersona);

        await expect(
          controller.patch(request, mockUser, personaId, { label: 'Renamed' }),
        ).rejects.toMatchObject({ status: 404 });
        expect(mockServiceMethods.patch).not.toHaveBeenCalled();
        expect(mockServiceMethods.assignMembers).not.toHaveBeenCalled();
      });

      it('answers 404 when a member deletes another organization character shared with all brands', async () => {
        mockServiceMethods.findOne.mockResolvedValue(foreignOrgPersona);
        mockServiceMethods.assertCanManageSharing.mockRejectedValue(
          new ForbiddenException('admins only'),
        );

        await expect(
          controller.remove(request, mockUser, personaId),
        ).rejects.toMatchObject({ status: 404 });
        expect(
          mockServiceMethods.assertCanManageSharing,
        ).not.toHaveBeenCalled();
        expect(mockServiceMethods.remove).not.toHaveBeenCalled();
      });

      it('answers 404 for an admin deleting another organization character', async () => {
        mockServiceMethods.findOne.mockResolvedValue(foreignOrgPersona);

        await expect(
          controller.remove(request, mockUser, personaId),
        ).rejects.toMatchObject({ status: 404 });
        expect(mockServiceMethods.remove).not.toHaveBeenCalled();
      });

      it('scopes the base id lookup to the caller organization', () => {
        expect(controller.buildFindOneQuery(mockUser, personaId)).toEqual({
          id: personaId,
          isDeleted: false,
          organizationId,
        });
      });
    });

    it('passes the authenticated user so API-key role caps apply', async () => {
      const apiKeyUser = { ...mockUser, isApiKey: true, scopes: ['read'] };
      mockServiceMethods.findOne.mockResolvedValue(sharedPersona);
      mockServiceMethods.patch.mockResolvedValue(sharedPersona);

      await controller.patch(request, apiKeyUser, personaId, { label: 'x' });

      expect(mockServiceMethods.assertCanManageSharing).toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyContext: apiKeyUser }),
      );
    });

    it('drops availability fields from generic create and update payloads', async () => {
      const createDto: Record<string, unknown> = {
        ...controller.enrichCreateDto(
          {
            availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
            label: 'Anna',
          } as never,
          mockUser,
        ),
      };
      expect(createDto.availabilityMode).toBeUndefined();
      expect(createDto.label).toBe('Anna');

      const updateDto = (await controller.enrichUpdateDto(
        {
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          availableBrandIds: [otherBrandId],
          label: 'Anna',
        } as never,
        mockUser,
      )) as Record<string, unknown>;
      expect(updateDto.availabilityMode).toBeUndefined();
      expect(updateDto.availableBrandIds).toBeUndefined();
      expect(updateDto.label).toBe('Anna');
    });
  });
});
