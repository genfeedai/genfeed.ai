import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsOperationsController } from '@api/collections/organizations/controllers/organizations-operations.controller';
import type { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('OrganizationsOperationsController', () => {
  const operationsService = { switchOrganization: vi.fn() };
  const controller = new OrganizationsOperationsController(
    operationsService as unknown as OrganizationsOperationsService,
  );
  const user = {
    brandId: 'brand_active',
    id: 'user_1',
    organizationId: 'org_active',
    userId: 'user_1',
  } as User;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('activates organizations via PATCH and preserves the original OpenAPI identity', () => {
    const handler =
      OrganizationsOperationsController.prototype.switchOrganization;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/activate');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).not.toBe('switch/:id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'OrganizationsController.switchOrganization',
      summary: 'switchOrganization',
    });
  });

  it('delegates the authenticated switch request', async () => {
    const result = {
      brand: { id: 'brand_new', label: 'New Brand' },
      organization: { id: 'org_new', label: 'New Org' },
    };
    operationsService.switchOrganization.mockResolvedValue(result);

    await expect(controller.switchOrganization('org_new', user)).resolves.toBe(
      result,
    );
    expect(operationsService.switchOrganization).toHaveBeenCalledWith(
      'org_new',
      user,
    );
  });
});
