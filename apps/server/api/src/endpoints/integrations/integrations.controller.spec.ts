import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls findAll on the service', async () => {
    integrationsService.findAll.mockResolvedValue([]);
    const request = { originalUrl: '/organizations/org1/integrations' };
    await controller.findAll(request as never, 'org1');
    expect(integrationsService.findAll).toHaveBeenCalledWith('org1');
  });

  it('calls findOne on the service with correct params', async () => {
    integrationsService.findOne.mockResolvedValue({ _id: 'int-1' });
    const request = { originalUrl: '/organizations/org1/integrations/int-1' };
    await controller.findOne(request as never, 'org1', 'int-1');
    expect(integrationsService.findOne).toHaveBeenCalledWith('org1', 'int-1');
  });

  it('calls create on the service with dto', async () => {
    const dto = { botToken: 'token', platform: 'discord' };
    integrationsService.create.mockResolvedValue({ _id: 'new-int' });
    const request = { originalUrl: '/organizations/org1/integrations' };
    await controller.create(request as never, 'org1', dto as never);
    expect(integrationsService.create).toHaveBeenCalledWith('org1', dto);
  });

  it('calls update on the service with id and dto', async () => {
    const dto = { config: { channel: 'general' } };
    integrationsService.update.mockResolvedValue({ _id: 'int-1' });
    const request = { originalUrl: '/organizations/org1/integrations/int-1' };
    await controller.update(request as never, 'org1', 'int-1', dto as never);
    expect(integrationsService.update).toHaveBeenCalledWith(
      'org1',
      'int-1',
      dto,
    );
  });

  it('calls remove on the service with correct id', async () => {
    integrationsService.remove.mockResolvedValue(undefined);
    await controller.remove('org1', 'int-1');
    expect(integrationsService.remove).toHaveBeenCalledWith('org1', 'int-1');
  });

  it('propagates errors from findAll', async () => {
    integrationsService.findAll.mockRejectedValue(new Error('DB error'));
    const request = { originalUrl: '/organizations/org1/integrations' };
    await expect(controller.findAll(request as never, 'org1')).rejects.toThrow(
      'DB error',
    );
  });

  it('propagates errors from create', async () => {
    integrationsService.create.mockRejectedValue(new Error('Duplicate'));
    const request = { originalUrl: '/organizations/org1/integrations' };
    await expect(
      controller.create(request as never, 'org1', {
        botToken: 'x',
        platform: 'discord',
      } as never),
    ).rejects.toThrow('Duplicate');
  });

  it('returns the result from findOne', async () => {
    const integration = { _id: 'int-1', platform: 'discord' };
    integrationsService.findOne.mockResolvedValue(integration);
    const request = { originalUrl: '/organizations/org1/integrations/int-1' };
    const result = await controller.findOne(request as never, 'org1', 'int-1');
    expect(result).toBeDefined();
  });
});
