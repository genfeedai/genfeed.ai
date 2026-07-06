vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_data, _serializer) => ({ data: _data })),
}));

import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PersonasController', () => {
  let controller: PersonasController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
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
      path: '/personas/507f1f77bcf86cd799439017',
      protocol: 'https',
      query: {},
    } as any;

    it('should assign members to a persona when memberIds is present', async () => {
      const mockPersona = {
        _id: '507f191e810c19729de860ee',
        name: 'Test Persona',
      };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);
      mockServiceMethods.findOne.mockResolvedValue({
        _id: '507f1f77bcf86cd799439017',
        user: '507f1f77bcf86cd799439014',
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        memberIds: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
      };

      await controller.patch(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439017',
        body as any,
      );

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439017',
        ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
        '507f1f77bcf86cd799439012',
      );
    });

    it('should still apply remaining fields via the base patch when provided alongside memberIds', async () => {
      const mockPersona = {
        _id: '507f191e810c19729de860ee',
        name: 'Test Persona',
      };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);
      mockServiceMethods.findOne.mockResolvedValue({
        _id: '507f1f77bcf86cd799439017',
        user: '507f1f77bcf86cd799439014',
      });
      mockServiceMethods.patch.mockResolvedValue(mockPersona);

      const body = {
        label: 'Renamed Persona',
        memberIds: ['507f1f77bcf86cd799439015'],
      };

      await controller.patch(
        mockRequest,
        mockUser as any,
        '507f1f77bcf86cd799439017',
        body as any,
      );

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439017',
        ['507f1f77bcf86cd799439015'],
        '507f1f77bcf86cd799439012',
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
        _id: '507f1f77bcf86cd799439017',
        user: '507f1f77bcf86cd799439014',
      });

      await expect(
        controller.patch(
          mockRequest,
          mockUser as any,
          '507f1f77bcf86cd799439017',
          { memberIds: [] } as any,
        ),
      ).rejects.toThrow('DB error');
    });
  });
});
