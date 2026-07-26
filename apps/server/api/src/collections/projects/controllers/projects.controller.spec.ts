import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ProjectsController } from '@api/collections/projects/controllers/projects.controller';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import { ProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

const CALLER_ORG_ID = '507f1f77bcf86cd799439012';
const FOREIGN_ORG_ID = '507f1f77bcf86cd7994390aa';
const PROJECT_ID = '507f1f77bcf86cd799439014';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: CALLER_ORG_ID,
      user: '507f1f77bcf86cd799439011',
    } as IAuthPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/projects',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ProjectsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
    projectsService = module.get(ProjectsService);

    vi.spyOn(ProjectSerializer, 'serialize').mockImplementation((data) => ({
      data: data as never,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ProjectsController scopes its list query and its write-ownership check to
  // the caller's organization but inherits findOne from BaseCRUDController.
  // Before the containment gate, GET /projects/:id returned any organization's
  // project verbatim.
  describe('findOne cross-organization access', () => {
    it('returns 404 for a project owned by another organization', async () => {
      projectsService.findOne.mockResolvedValue({
        _id: PROJECT_ID,
        name: 'Foreign Project',
        organizationId: FOREIGN_ORG_ID,
      });

      await expect(
        controller.findOne(mockRequest, mockUser, PROJECT_ID),
      ).rejects.toThrow(HttpException);
    });

    it('returns the project when it belongs to the caller organization', async () => {
      const project = {
        _id: PROJECT_ID,
        name: 'Own Project',
        organizationId: CALLER_ORG_ID,
      };

      projectsService.findOne.mockResolvedValue(project);

      const result = await controller.findOne(
        mockRequest,
        mockUser,
        PROJECT_ID,
      );

      expect(result).toEqual(project);
    });

    it('scopes the single-read lookup to non-deleted rows', async () => {
      projectsService.findOne.mockResolvedValue({
        _id: PROJECT_ID,
        organizationId: CALLER_ORG_ID,
      });

      await controller.findOne(mockRequest, mockUser, PROJECT_ID);

      expect(projectsService.findOne).toHaveBeenCalledWith(
        { _id: PROJECT_ID, isDeleted: false },
        expect.anything(),
      );
    });
  });
});
