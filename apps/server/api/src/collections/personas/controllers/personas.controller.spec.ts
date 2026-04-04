vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_data, _serializer) => ({ data: _data })),
}));

import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

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

  describe('assignMembers', () => {
    it('should assign members to a persona', async () => {
      const mockPersona = { _id: new Types.ObjectId(), name: 'Test Persona' };
      mockServiceMethods.assignMembers.mockResolvedValue(mockPersona);

      const body = {
        memberIds: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
      };

      await controller.assignMembers(
        '507f1f77bcf86cd799439017',
        body,
        mockUser as any,
      );

      expect(mockServiceMethods.assignMembers).toHaveBeenCalledWith(
        new Types.ObjectId('507f1f77bcf86cd799439017'),
        [
          new Types.ObjectId('507f1f77bcf86cd799439015'),
          new Types.ObjectId('507f1f77bcf86cd799439016'),
        ],
        new Types.ObjectId('507f1f77bcf86cd799439012'),
      );
    });

    it('should handle errors gracefully', async () => {
      mockServiceMethods.assignMembers.mockRejectedValue(new Error('DB error'));

      // ErrorResponse.handle re-throws HttpException or wraps in internal error
      await expect(
        controller.assignMembers(
          '507f1f77bcf86cd799439017',
          { memberIds: [] },
          mockUser as any,
        ),
      ).rejects.toThrow();
    });
  });
});
