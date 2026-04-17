import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Role } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('RolesService', () => {
  let service: RolesService;

  const mockRole = {
    _id: 'role-id',
    isDeleted: false,
    key: 'admin',
    label: 'Admin',
    save: vi.fn(),
    toObject: vi.fn(),
  };

  let mockRoleModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    mockRoleModel = vi.fn().mockImplementation(function (
      dto: typeof CreateRoleDto,
    ) {
      return { ...mockRole, ...dto, save: vi.fn().mockResolvedValue(mockRole) };
    });
    mockRoleModel.collection = { name: 'roles' };
    mockRoleModel.modelName = 'Role';
    mockRoleModel.aggregate = vi.fn();
    mockRoleModel.aggregatePaginate = vi.fn();
    mockRoleModel.create = vi.fn();
    mockRoleModel.exec = vi.fn();
    mockRoleModel.find = vi.fn();
    mockRoleModel.findById = vi
      .fn()
      .mockReturnValue({ exec: vi.fn(), populate: vi.fn().mockReturnThis() });
    mockRoleModel.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    mockRoleModel.findOne = vi.fn();
    mockRoleModel.findOneAndUpdate = vi.fn();
    mockRoleModel.updateMany = vi.fn().mockReturnValue({ exec: vi.fn() });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockRoleModel },
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

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a role', async () => {
      const createRoleDto: CreateRoleDto = {
        key: 'admin',
        label: 'Admin',
      };

      // BaseService.create() uses new this.model(dto).save(), not model.create()
      mockRoleModel.mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(mockRole) };
      });

      const result = await service.create(createRoleDto);

      expect(mockRoleModel).toHaveBeenCalledWith(createRoleDto);
      expect(result).toEqual(mockRole);
    });
  });

  describe('findAll', () => {
    it('should return paginated roles', async () => {
      const mockPaginatedResult = {
        docs: [mockRole],
        limit: 10,
        page: 1,
        totalDocs: 1,
      };

      mockRoleModel.aggregatePaginate.mockResolvedValue(mockPaginatedResult);

      const result = await service.findAll([], { limit: 10, page: 1 });

      expect(result).toEqual(mockPaginatedResult);
    });
  });

  describe('findOne', () => {
    it('should find a role by conditions', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockRole),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: 'role-id' });

      // BaseService.findOne passes params through processSearchParams as-is
      // 'role-id' is not a valid ObjectId so it stays as string
      expect(mockRoleModel.findOne).toHaveBeenCalledWith({ _id: 'role-id' });
      expect(result).toEqual(mockRole);
    });
  });

  describe('patch', () => {
    it('should update a role', async () => {
      const updateData: UpdateRoleDto = {
        label: 'Updated Admin',
      };

      mockRoleModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockRole, ...updateData }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch('role-id', updateData);

      // BaseService.patch wraps plain objects in $set and uses findByIdAndUpdate
      expect(mockRoleModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'role-id',
        { $set: updateData },
        { returnDocument: 'after' },
      );
      expect(result).toEqual({ ...mockRole, ...updateData });
    });
  });
});
