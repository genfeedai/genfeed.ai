import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ProjectsController } from '@api/collections/projects/controllers/projects.controller';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ProjectSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
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

const CALLER_ORG_ID = 'cmorganization000000000000001';
const FOREIGN_ORG_ID = 'cmorganization000000000000002';
const PROJECT_ID = 'cmproject000000000000000001';

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
    brandId: testId('brand'),
    organizationId: CALLER_ORG_ID,
    userId: testId('user'),
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
        id: PROJECT_ID,
        name: 'Foreign Project',
        organizationId: FOREIGN_ORG_ID,
      });

      await expect(
        controller.findOne(mockRequest, mockUser, PROJECT_ID),
      ).rejects.toThrow(HttpException);
    });

    it('returns the project when it belongs to the caller organization', async () => {
      const project = {
        id: PROJECT_ID,
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
        id: PROJECT_ID,
        organizationId: CALLER_ORG_ID,
      });

      await controller.findOne(mockRequest, mockUser, PROJECT_ID);

      expect(projectsService.findOne).toHaveBeenCalledWith(
        { id: PROJECT_ID, isDeleted: false },
        expect.anything(),
      );
    });
  });

  describe('canUserModifyEntity', () => {
    it('allows modification when the canonical organization ID matches', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          organizationId: CALLER_ORG_ID,
        } as never),
      ).toBe(true);
    });

    it('does not authorize from the legacy organization relation alias', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          organization: { id: CALLER_ORG_ID },
        } as never),
      ).toBe(false);
    });

    it('denies when the entity organizationId is missing', () => {
      expect(controller.canUserModifyEntity(mockUser, {} as never)).toBe(false);
    });
  });
});
