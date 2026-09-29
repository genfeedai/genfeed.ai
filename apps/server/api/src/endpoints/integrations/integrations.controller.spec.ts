import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OrganizationsIntegrationsController', () => {
  let controller: OrganizationsIntegrationsController;
  let integrationsService: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  const mockUser = {
    organizationId: 'org1',
  } as unknown as User;

  beforeEach(async () => {
    integrationsService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsIntegrationsController],
      providers: [
        {
          provide: FilesClientService,
          useValue: { uploadToS3: vi.fn() },
        },
        {
          provide: IntegrationsService,
          useValue: integrationsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsIntegrationsController>(
      OrganizationsIntegrationsController,
    );
  });

  it('propagates errors from findAll', async () => {
    integrationsService.findAll.mockRejectedValue(new Error('DB error'));
    const request = { originalUrl: '/organizations/org1/integrations' };
    await expect(
      controller.findAll(request as never, mockUser, 'org1'),
    ).rejects.toThrow('DB error');
  });
});
