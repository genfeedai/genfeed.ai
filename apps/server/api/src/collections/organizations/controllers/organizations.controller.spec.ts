vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeCollection: vi.fn((_request, _serializer, data) => data),
    serializeSingle: vi.fn((_request, _serializer, data) => data),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import type { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { SKIP_ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

describe('OrganizationsController', () => {
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const organizationsService = {
    findAll: vi.fn(),
    findBySlug: vi.fn(),
  };
  const operationsService = {
    canUserReadEntity: vi.fn(),
    createOrganization: vi.fn(),
    findMine: vi.fn(),
  };
  const user = {
    brandId: 'brand_active',
    id: 'user_1',
    isSuperAdmin: false,
    organizationId: 'org_active',
    userId: 'user_1',
  } as User;
  const request = {
    originalUrl: '/api/organizations',
    query: {},
  } as Request;
  const controller = new OrganizationsController(
    loggerService as unknown as LoggerService,
    organizationsService as unknown as OrganizationsService,
    operationsService as unknown as OrganizationsOperationsService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps membership discovery outside active-organization role validation', () => {
    expect(
      Reflect.getMetadata(
        SKIP_ROLES_KEY,
        OrganizationsController.prototype.findAll,
      ),
    ).toBe(true);
  });

  it('delegates organization access decisions to the operations service', async () => {
    const organization = { id: 'org_other' } as OrganizationDocument;
    operationsService.canUserReadEntity.mockResolvedValue(true);

    await expect(
      controller.canUserReadEntity(user, organization),
    ).resolves.toBe(true);
    expect(operationsService.canUserReadEntity).toHaveBeenCalledWith(
      user,
      organization,
    );
  });

  it('delegates membership-visible lists for regular users', async () => {
    const memberships = [{ id: 'org_active', label: 'Active Org' }];
    operationsService.findMine.mockResolvedValue(memberships);

    await expect(controller.findAll(request, user, {} as never)).resolves.toBe(
      memberships,
    );
    expect(operationsService.findMine).toHaveBeenCalledWith(user);
    expect(organizationsService.findAll).not.toHaveBeenCalled();
  });

  it('preserves the platform-wide superadmin list', async () => {
    const collection = { docs: [{ id: 'org_1' }] };
    organizationsService.findAll.mockResolvedValue(collection);

    await expect(
      controller.findAll(request, { ...user, isSuperAdmin: true }, {} as never),
    ).resolves.toBe(collection);
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false } }),
      expect.any(Object),
    );
  });

  it('keeps the create override transport-only and preserves its envelope', async () => {
    const result = {
      brand: { id: 'brand_new', label: 'New Org' },
      organization: { id: 'org_new', label: 'New Org' },
    };
    operationsService.createOrganization.mockResolvedValue(result);
    const dto = {
      description: 'Description',
      label: 'New Org',
    } as unknown as CreateOrganizationDto;

    await expect(controller.create(request, user, dto)).resolves.toBe(result);
    expect(operationsService.createOrganization).toHaveBeenCalledWith(
      { description: 'Description', label: 'New Org' },
      user,
    );
  });

  describe('findBySlug', () => {
    const organization = {
      id: 'org_other',
      label: 'Other Org',
      userId: 'user_other',
    } as OrganizationDocument;

    it('returns a readable organization with the existing serializer path', async () => {
      organizationsService.findBySlug.mockResolvedValue(organization);
      operationsService.canUserReadEntity.mockResolvedValue(true);

      await expect(
        controller.findBySlug(request, 'other-org', user),
      ).resolves.toBe(organization);
      expect(operationsService.canUserReadEntity).toHaveBeenCalledWith(
        user,
        organization,
        false,
      );
    });

    it.each([
      ['unknown slug', null],
      ['denied foreign organization', organization],
    ])('uses the same anti-probing 404 for an %s', async (_case, result) => {
      organizationsService.findBySlug.mockResolvedValue(result);
      operationsService.canUserReadEntity.mockResolvedValue(false);

      const error = await controller
        .findBySlug(request, 'other-org', user)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(
        HttpStatus.NOT_FOUND,
      );
      expect((error as NotFoundException).getResponse()).toEqual({
        detail: 'Organization with slug "other-org" not found',
        title: 'Resource Not Found',
      });
    });
  });
});
