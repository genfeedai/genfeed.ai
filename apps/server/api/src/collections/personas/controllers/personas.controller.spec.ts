vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_data, _serializer) => ({ data: _data })),
}));

import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PersonaStatus } from '@genfeedai/enums';
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

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  };

  const mockServiceMethods = {
    assignMembers: vi.fn(),
    create: vi.fn(),
    createFromApprovedSheet: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    listCharacterMentions: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonasController],
      providers: [
        { provide: PersonasService, useValue: mockServiceMethods },
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
    } as any;

    it('should assign members to a persona when memberIds is present', async () => {
      const mockPersona = {
        id: assignedPersonaId,
        name: 'Test Persona',
      };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        memberIds: [memberId1, memberId2],
      };

      await controller.patch(
        mockRequest,
        mockUser as any,
        personaId,
        body as any,
      );

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
        userId,
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        label: 'Renamed Persona',
        memberIds: [memberId1],
      };

      await controller.patch(
        mockRequest,
        mockUser as any,
        personaId,
        body as any,
      );

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

    it('should propagate errors from the assignment call', async () => {
      mockServiceMethods.assignMembers.mockRejectedValue(new Error('DB error'));
      mockServiceMethods.findOne.mockResolvedValue({
        id: personaId,
        userId,
      });

      await expect(
        controller.patch(mockRequest, mockUser as any, personaId, {
          memberIds: [memberId1],
        } as any),
      ).rejects.toThrow('DB error');
    });
  });

  describe('composeSheetPrompt', () => {
    it('returns the server-composed character sheet preset', async () => {
      const result = await controller.composeSheetPrompt(mockUser as never, {
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
    it('creates a persona from an approved sheet', async () => {
      mockServiceMethods.createFromApprovedSheet.mockResolvedValue({
        handle: 'anna',
        id: personaId,
        label: 'Anna',
      });

      const result = await controller.createFromSheet(mockUser as never, {
        assetId: testId('asset'),
        handle: 'anna',
        label: 'Anna',
      });

      expect(mockServiceMethods.createFromApprovedSheet).toHaveBeenCalledWith({
        assetId: testId('asset'),
        brandId,
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

      const result = await controller.getMentions(mockUser as never, 'an');

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
      const query = controller.buildFindAllQuery(
        mockUser as never,
        {
          isMentionable: true,
          q: 'an',
        } as never,
      );

      expect(query.where).toMatchObject({
        brandId,
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
        controller.buildFindAllQuery(
          mockUser as never,
          {
            isMentionable: true,
            organizationId: testId('org', 9),
            q: 'an',
          } as never,
        );

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
});
