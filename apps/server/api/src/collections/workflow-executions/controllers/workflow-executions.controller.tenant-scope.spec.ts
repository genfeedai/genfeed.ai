import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionQueryDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

describe('WorkflowExecutionsController tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const module = await Test.createTestingModule({
      controllers: [WorkflowExecutionsController],
      providers: [
        { provide: WorkflowExecutionsService, useValue: { findAll: mock } },
        { provide: WorkflowExecutionAuthorizationService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<WorkflowExecutionsController>(
      WorkflowExecutionsController,
    );
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = await setup();
    const user = adminUser;
    const query = tenantReadQuery(WorkflowExecutionQueryDto, {
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
    const query = tenantReadQuery(WorkflowExecutionQueryDto, {
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
    const query = tenantReadQuery(WorkflowExecutionQueryDto, {});
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
  const query = tenantReadQuery(WorkflowExecutionQueryDto, {
    dayStart: '2026-10-05T00:00:00Z',
    dayEnd: '2026-10-06T00:00:00Z',
    view: 'statistics' as const,
  });
  async function setup() {
    const mock = vi.fn().mockResolvedValue({});
    const module = await Test.createTestingModule({
      controllers: [WorkflowExecutionsController],
      providers: [
        {
          provide: WorkflowExecutionsService,
          useValue: { getCustomerSummary: mock },
        },
        { provide: WorkflowExecutionAuthorizationService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<WorkflowExecutionsController>(
      WorkflowExecutionsController,
    );
    return { controller, mock };
  }
  it('uses the target tenant for a superadmin', async () => {
    const { controller, mock } = await setup();
    await controller.findAll(
      tenantReadRequest(adminUser),
      adminUser,
      tenantReadQuery(WorkflowExecutionQueryDto, {
        ...query,
        organizationId: targetOrganizationId,
      }),
    );
    expect(mock.mock.calls[0]?.[0]).toBe(targetOrganizationId);
  });
  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = await setup();
    await expect(
      controller.findAll(
        tenantReadRequest(),
        memberUser,
        tenantReadQuery(WorkflowExecutionQueryDto, {
          ...query,
          organizationId: targetOrganizationId,
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });
  it('keeps the member session scope', async () => {
    const { controller, mock } = await setup();
    await controller.findAll(tenantReadRequest(), memberUser, query);
    expect(mock.mock.calls[0]?.[0]).toBe(sessionOrganizationId);
  });
});
