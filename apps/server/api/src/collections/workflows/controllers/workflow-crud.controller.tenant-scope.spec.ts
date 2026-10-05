import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { WorkflowQueryDto } from '@api/collections/workflows/dto/query-workflow.dto';
import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
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
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('WorkflowCrudController tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const module = await Test.createTestingModule({
      controllers: [WorkflowCrudController],
      providers: [
        { provide: WorkflowsService, useValue: { findAll: mock } },
        { provide: WorkflowSchedulerService, useValue: {} },
        { provide: SystemWorkflowCatalogService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<WorkflowCrudController>(
      WorkflowCrudController,
    );
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = await setup();
    const user = adminUser;
    const query = tenantReadQuery(WorkflowQueryDto, {
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
    const query = tenantReadQuery(WorkflowQueryDto, {
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
    const query = tenantReadQuery(WorkflowQueryDto, {});
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

describe.each(['system-catalog', 'statistics'] as const)(
  'Workflow %s tenant reads (#6176)',
  (branch) => {
    async function setup() {
      const mock = vi.fn().mockResolvedValue([]);
      const module = await Test.createTestingModule({
        controllers: [WorkflowCrudController],
        providers: [
          {
            provide: WorkflowsService,
            useValue: { getWorkflowStatistics: mock },
          },
          { provide: WorkflowSchedulerService, useValue: {} },
          {
            provide: SystemWorkflowCatalogService,
            useValue: { listCatalogForOrganization: mock },
          },
          {
            provide: LoggerService,
            useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
          },
        ],
      })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const controller = module.get<WorkflowCrudController>(
        WorkflowCrudController,
      );
      return { controller, mock };
    }

    it('uses the target tenant for a superadmin', async () => {
      const { controller, mock } = await setup();
      await controller.findAll(
        tenantReadRequest(adminUser),
        adminUser,
        tenantReadQuery(WorkflowQueryDto, {
          organizationId: targetOrganizationId,
          ...(branch === 'system-catalog'
            ? { source: branch }
            : { view: branch }),
        }),
      );
      expect(mock.mock.calls[0]).toContain(targetOrganizationId);
      expect(mock.mock.calls[0]).not.toContain(sessionOrganizationId);
    });

    it('rejects a member foreign organization before reading', async () => {
      const { controller, mock } = await setup();
      await expect(
        controller.findAll(
          tenantReadRequest(),
          memberUser,
          tenantReadQuery(WorkflowQueryDto, {
            organizationId: targetOrganizationId,
            ...(branch === 'system-catalog'
              ? { source: branch }
              : { view: branch }),
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mock).not.toHaveBeenCalled();
    });

    it('keeps the member session scope', async () => {
      const { controller, mock } = await setup();
      await controller.findAll(
        tenantReadRequest(),
        memberUser,
        tenantReadQuery(
          WorkflowQueryDto,
          branch === 'system-catalog' ? { source: branch } : { view: branch },
        ),
      );
      expect(mock.mock.calls[0]).toContain(sessionOrganizationId);
    });
  },
);
