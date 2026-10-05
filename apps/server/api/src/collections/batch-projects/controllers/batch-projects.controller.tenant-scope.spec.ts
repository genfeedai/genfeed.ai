import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { BatchProjectSchedulingService } from '@api/collections/batch-projects/services/batch-project-scheduling.service';
import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('BatchProjectsController tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const module = await Test.createTestingModule({
      controllers: [BatchProjectsController],
      providers: [
        { provide: BatchProjectsService, useValue: { list: mock } },
        { provide: BatchProjectSchedulingService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<BatchProjectsController>(
      BatchProjectsController,
    );
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = await setup();
    const user = adminUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.findAll(request, user, query);
    const read = mock.mock.calls[0]?.[0];
    expect(fieldValues(read, 'organizationId')).toContain(targetOrganizationId);
    expect(fieldValues(read, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
    expect(fieldValues(read, 'isDeleted')).not.toContain(true);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = await setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, user, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = await setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.findAll(request, user, query);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'isDeleted')).not.toContain(
      true,
    );
  });
});
