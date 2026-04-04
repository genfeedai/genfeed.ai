vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { RolesController } from '@api/collections/roles/controllers/roles.controller';
import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';
import { RoleEntity } from '@api/collections/roles/entities/role.entity';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: vi.Mocked<RolesService>;

  const mockRole = {
    _id: 'role-id',
    isDeleted: false,
    key: 'admin',
    label: 'admin',
    primaryColor: '#000000',
  };

  const mockUser = {
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: 'user-id',
  };

  const mockReq = {} as import('express').Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
    rolesService = module.get(RolesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a role successfully', async () => {
      const createRoleDto: CreateRoleDto = {
        key: 'admin',
        label: 'admin',
        primaryColor: '#000000',
      };

      rolesService.create.mockResolvedValue(mockRole);

      const result = await controller.create(mockReq, mockUser, createRoleDto);

      expect(rolesService.create).toHaveBeenCalledWith(expect.any(RoleEntity));
      expect(result).toBeDefined();
    });

    it('should throw HttpException when create fails', async () => {
      const createRoleDto: CreateRoleDto = {
        key: 'admin',
        label: 'admin',
        primaryColor: '#000000',
      };

      rolesService.create.mockRejectedValue(new Error('Creation failed'));

      await expect(
        controller.create(mockReq, mockUser, createRoleDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      rolesService.findAll.mockResolvedValue({
        docs: [mockRole],
        totalDocs: 1,
      });

      const result = await controller.findAll(mockReq, {});

      expect(rolesService.findAll).toHaveBeenCalledWith(expect.any(Array), {
        pagination: false,
      });
      expect(result).toBeDefined();
    });

    it('should throw HttpException when findAll fails', async () => {
      rolesService.findAll.mockRejectedValue(new Error('Fetch failed'));

      await expect(controller.findAll(mockReq, {})).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a role by id', async () => {
      const roleId = 'role-id';

      rolesService.findOne.mockResolvedValue(mockRole);

      const result = await controller.findOne(mockReq, roleId);

      expect(rolesService.findOne).toHaveBeenCalledWith({ _id: roleId });
      expect(result).toBeDefined();
    });

    it('should throw HttpException when role not found', async () => {
      const roleId = 'non-existent-id';

      rolesService.findOne.mockResolvedValue(null);

      await expect(controller.findOne(mockReq, roleId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException when findOne fails', async () => {
      const roleId = 'role-id';

      rolesService.findOne.mockRejectedValue(new Error('Fetch failed'));

      await expect(controller.findOne(mockReq, roleId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('update', () => {
    it('should update a role successfully', async () => {
      const roleId = 'role-id';
      const updateRoleDto: UpdateRoleDto = {
        label: 'updated-admin',
      };

      rolesService.patch.mockResolvedValue(mockRole);

      const result = await controller.update(mockReq, roleId, updateRoleDto);

      expect(rolesService.patch).toHaveBeenCalledWith(roleId, updateRoleDto);
      expect(result).toBeDefined();
    });

    it('should throw HttpException when update fails', async () => {
      const roleId = 'role-id';
      const updateRoleDto: UpdateRoleDto = {
        label: 'updated-admin',
      };

      rolesService.patch.mockRejectedValue(new Error('Update failed'));

      await expect(
        controller.update(mockReq, roleId, updateRoleDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should soft delete a role successfully', async () => {
      const roleId = 'role-id';

      rolesService.patch.mockResolvedValue(mockRole);

      const result = await controller.remove(mockReq, roleId);

      expect(rolesService.patch).toHaveBeenCalledWith(roleId, {
        isDeleted: true,
      });
      expect(result).toBeDefined();
    });

    it('should throw HttpException when delete fails', async () => {
      const roleId = 'role-id';

      rolesService.patch.mockRejectedValue(new Error('Delete failed'));

      await expect(controller.remove(mockReq, roleId)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
