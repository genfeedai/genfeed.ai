import { ElementsBlacklistsController } from '@api/collections/elements/blacklists/controllers/blacklists.controller';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ElementsBlacklistsController', () => {
  let controller: ElementsBlacklistsController;
  let service: ElementsBlacklistsService;

  const mockElementsBlacklistsService = {
    create: vi.fn(),
    delete: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patchOneWhere: vi.fn(),
    update: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsBlacklistsController],
      providers: [
        {
          provide: ElementsBlacklistsService,
          useValue: mockElementsBlacklistsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsBlacklistsController>(
      ElementsBlacklistsController,
    );
    service = module.get<ElementsBlacklistsService>(ElementsBlacklistsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have blacklistsService injected', () => {
    expect(controller.blacklistsService).toBeDefined();
    expect(controller.blacklistsService).toBe(service);
  });

  it('should have loggerService injected', () => {
    expect(controller.loggerService).toBeDefined();
  });
  describe('buildFindAllQuery', () => {
    const orgId = testId('org');

    it('reads active platform defaults plus the caller organization', () => {
      const { where } = controller.buildFindAllQuery(
        { id: 'auth-user', organizationId: orgId } as never,
        {} as never,
      );

      expect(where).toEqual({
        isDeleted: false,
        OR: [
          { isActive: true, organizationId: null },
          { organizationId: orgId },
        ],
      });
    });

    it('lets a superadmin see inactive platform defaults too', () => {
      const { where } = controller.buildFindAllQuery(
        { id: 'auth-user', isSuperAdmin: true, organizationId: orgId } as never,
        {} as never,
      );

      expect(where).toEqual({
        isDeleted: false,
        OR: [{ organizationId: null }, { organizationId: orgId }],
      });
    });

    it('filters by category and searches label and description', () => {
      const { where } = controller.buildFindAllQuery(
        { id: 'auth-user', organizationId: orgId } as never,
        { category: 'image', value: 'text' } as never,
      );

      expect(where).toMatchObject({
        AND: [
          {
            OR: [
              { label: { contains: 'text', mode: 'insensitive' } },
              { description: { contains: 'text', mode: 'insensitive' } },
            ],
          },
        ],
        category: 'image',
      });
    });
  });

  describe('enrichCreateDto', () => {
    const dto = { key: 'text', label: 'No text' } as never;

    it('creates a platform default for a superadmin', () => {
      const enriched = controller.enrichCreateDto(dto, {
        id: 'auth-user',
        isSuperAdmin: true,
        organizationId: testId('org'),
      } as never);

      expect(enriched).toMatchObject({ key: 'text', organizationId: null });
    });

    it('refuses a platform default from a non-superadmin', () => {
      expect(() =>
        controller.enrichCreateDto(
          { ...(dto as object), isPlatformDefault: true } as never,
          { id: 'auth-user', organizationId: testId('org') } as never,
        ),
      ).toThrow();
    });
  });

  describe('update', () => {
    const orgId = testId('org');
    const entryId = testId('blacklist');
    const user = { id: 'auth-user', organizationId: orgId, userId: 'user-1' };
    const request = { context: {} } as never;

    it('reads and writes inside the caller organization', async () => {
      const entry = { id: entryId, organizationId: orgId };
      mockElementsBlacklistsService.findOne.mockResolvedValue(entry);
      mockElementsBlacklistsService.patchOneWhere.mockResolvedValue(entry);

      await controller.update(request, user as never, entryId, {} as never);

      expect(mockElementsBlacklistsService.findOne).toHaveBeenCalledWith(
        { id: entryId, isDeleted: false, organizationId: orgId },
        [],
      );
      expect(mockElementsBlacklistsService.patchOneWhere).toHaveBeenCalledWith(
        { id: entryId, isDeleted: false, organizationId: orgId },
        {},
        expect.anything(),
      );
    });

    it('returns not found for an entry outside the caller organization', async () => {
      mockElementsBlacklistsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(request, user as never, entryId, {} as never),
      ).rejects.toThrow();
      expect(
        mockElementsBlacklistsService.patchOneWhere,
      ).not.toHaveBeenCalled();
    });
  });
});
