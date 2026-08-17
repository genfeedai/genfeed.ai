vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_data, _serializer) => ({ data: _data })),
}));

import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
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
    findAll: vi.fn(),
    findOne: vi.fn(),
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
});
