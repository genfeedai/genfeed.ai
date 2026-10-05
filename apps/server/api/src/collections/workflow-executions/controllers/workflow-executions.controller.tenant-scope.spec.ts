import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('WorkflowExecutionsController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.assign(
      Object.create(
        WorkflowExecutionsController.prototype,
      ) as WorkflowExecutionsController,
      {
        workflowExecutionsService: { findAll: mock },
        loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    );
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = { organizationId: targetOrganizationId };
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
    const { controller, mock } = setup();
    const user = memberUser;
    const query = { organizationId: targetOrganizationId };
    const request = tenantReadRequest(user, query);
    await expect(controller.findAll(request, user, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = {};
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

describe('Workflow execution statistics tenant reads (#6176)', () => {
  const query = {
    dayStart: '2026-10-05T00:00:00Z',
    dayEnd: '2026-10-06T00:00:00Z',
    view: 'statistics' as const,
  };
  function setup() {
    const mock = vi.fn().mockResolvedValue({});
    const controller = Object.assign(
      Object.create(
        WorkflowExecutionsController.prototype,
      ) as WorkflowExecutionsController,
      { workflowExecutionsService: { getCustomerSummary: mock } },
    );
    return { controller, mock };
  }
  it('uses the target tenant for a superadmin', async () => {
    const { controller, mock } = setup();
    await controller.findAll(tenantReadRequest(adminUser), adminUser, {
      ...query,
      organizationId: targetOrganizationId,
    });
    expect(mock.mock.calls[0]?.[0]).toBe(targetOrganizationId);
  });
  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    await expect(
      controller.findAll(tenantReadRequest(), memberUser, {
        ...query,
        organizationId: targetOrganizationId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });
  it('keeps the member session scope', async () => {
    const { controller, mock } = setup();
    await controller.findAll(tenantReadRequest(), memberUser, query);
    expect(mock.mock.calls[0]?.[0]).toBe(sessionOrganizationId);
  });
});
