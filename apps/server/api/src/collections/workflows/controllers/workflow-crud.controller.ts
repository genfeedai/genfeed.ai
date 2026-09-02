import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowQueryDto } from '@api/collections/workflows/dto/query-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import {
  type SystemWorkflowCatalogListItem,
  SystemWorkflowCatalogService,
} from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { buildWorkflowListWhere } from '@api/collections/workflows/utils/workflow-list-where.util';
import { withNextRunAt } from '@api/collections/workflows/utils/workflow-next-run.util';
import { assertCanIncludeSystemWorkflows } from '@api/collections/workflows/utils/workflow-system-access.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { MemberRole } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

export interface SystemWorkflowCatalogResponse {
  data: SystemWorkflowCatalogListItem[];
}

export interface WorkflowStatisticsResponse {
  data: Awaited<ReturnType<WorkflowsService['getWorkflowStatistics']>>;
}

/**
 * Standard workflow CRUD (+ statistics view and ComfyUI export). Registered LAST
 * among the workflow controllers so its `:workflowId` param route never
 * shadows the literal routes (templates, batch, marketplace, …)
 * owned by the sibling controllers. Split out of the former monolithic
 * `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
@UseGuards(RolesGuard)
export class WorkflowCrudController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowSchedulerService: WorkflowSchedulerService,
    private readonly systemWorkflowCatalogService: SystemWorkflowCatalogService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post()
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const workflow = await this.workflowsService.createWorkflow(
        user.userId ?? user.id,
        user.organizationId,
        createWorkflowDto,
        user.brandId || undefined,
      );

      return serializeSingle(
        request,
        WorkflowSerializer,
        withNextRunAt(workflow),
      );
    }, 'Failed to create workflow');
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: WorkflowQueryDto,
  ): Promise<
    | JsonApiCollectionResponse
    | SystemWorkflowCatalogResponse
    | WorkflowStatisticsResponse
  > {
    assertCanIncludeSystemWorkflows(
      request,
      user,
      query.includeSystem === true,
    );

    // Code-owned system catalog (not persisted rows). Same collection resource
    // as workflows; filter via query instead of a parallel /system-catalog path.
    if (query.source === 'system-catalog') {
      return wrapError(async () => {
        const data =
          await this.systemWorkflowCatalogService.listCatalogForOrganization(
            user.organizationId,
          );
        return { data };
      }, 'Failed to list system workflow catalog');
    }

    if (query.view === 'statistics') {
      return wrapError(async () => {
        const stats = await this.workflowsService.getWorkflowStatistics(
          user.userId ?? user.id,
          user.organizationId,
        );
        return { data: stats };
      }, 'Failed to load workflow statistics');
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // `referencable=true` widens the list to every tenant workflow in the org
    // (workflow-reference pickers). `includeSystem=true` is the admin list of
    // persisted system-workflow clones. Customer Automation never sees those.
    const where = buildWorkflowListWhere({
      brandId: query.brandId,
      includeSystem: query.includeSystem === true,
      isDeleted,
      organizationId: user.organizationId,
      referencable: query.referencable === true,
      userId: user.userId ?? user.id,
    });

    const aggregate = {
      where,
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<WorkflowDocument> =
      await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, {
      ...data,
      docs: data.docs.map(withNextRunAt),
    });
  }

  @Get(':workflowId/export-comfyui')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async exportComfyUI(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: Record<string, unknown> | null }> {
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    const template = (workflow as WorkflowDocument).comfyuiTemplate;
    if (!template) {
      throw new HttpException(
        'This workflow does not have a ComfyUI template',
        HttpStatus.NOT_FOUND,
      );
    }

    return { data: template };
  }

  @Get(':workflowId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const workflow = await this.workflowsService.findVisibleOrThrow(
      workflowId,
      {
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
    );

    return serializeSingle(
      request,
      WorkflowSerializer,
      withNextRunAt(workflow),
    );
  }

  /**
   * Single mutation entry point for the workflow resource. After the REST
   * audit collapse (#1354) this route absorbs the former dedicated RPC routes:
   * lifecycle publish/archive (`{ lifecycle }`), thumbnail
   * (`{ thumbnail, thumbnailNodeId }`), schedule set/remove
   * (`{ schedule, timezone, isScheduleEnabled }` — re-registers the BullMQ cron
   * via the scheduler), and marketplace publish
   * (`{ isPublic: true, isTemplate: true }` — seller-lookup/listing cascade
   * behind the service). Plain field writes fall through to `patch`.
   */
  @Patch(':workflowId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    // Marketplace publish: flip public + template and run the seller-lookup +
    // listing-creation cascade behind the service. Self-guards via
    // findMutableOwnedOrThrow inside the service.
    if (
      updateWorkflowDto.isPublic === true &&
      updateWorkflowDto.isTemplate === true
    ) {
      return wrapError(async () => {
        const workflow = await this.workflowsService.publishToMarketplace(
          workflowId,
          user.userId ?? user.id,
          user.organizationId,
        );

        return serializeSingle(request, WorkflowSerializer, workflow);
      }, 'Failed to publish workflow to marketplace');
    }

    // Schedule-only patches are allowed on organization-visible system
    // workflows (pause / cadence). Graph and other field writes still require
    // a mutable owned row — canonical system graphs stay immutable.
    const touchesSchedule =
      Object.hasOwn(updateWorkflowDto, 'schedule') ||
      Object.hasOwn(updateWorkflowDto, 'timezone') ||
      Object.hasOwn(updateWorkflowDto, 'isScheduleEnabled');
    const { schedule, timezone, isScheduleEnabled, ...rest } =
      updateWorkflowDto;
    const hasNonScheduleFields = Object.keys(rest).length > 0;
    const scope = {
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };

    const workflow =
      touchesSchedule && !hasNonScheduleFields
        ? await this.workflowsService.findVisibleOrThrow(workflowId, scope)
        : await this.workflowsService.findMutableOwnedOrThrow(
            workflowId,
            scope,
          );

    if (touchesSchedule) {
      return wrapError(async () => {
        if (hasNonScheduleFields) {
          await this.workflowsService.patch(workflowId, rest);
        }

        const nextSchedule = Object.hasOwn(updateWorkflowDto, 'schedule')
          ? (schedule ?? null)
          : (workflow.schedule ?? null);
        const nextTimezone = Object.hasOwn(updateWorkflowDto, 'timezone')
          ? (timezone ?? 'UTC')
          : (workflow.timezone ?? 'UTC');
        const nextEnabled = Object.hasOwn(
          updateWorkflowDto,
          'isScheduleEnabled',
        )
          ? (isScheduleEnabled ?? false)
          : (workflow.isScheduleEnabled ?? false);

        await this.workflowSchedulerService.updateSchedule(
          workflowId,
          nextSchedule,
          nextTimezone,
          nextEnabled,
        );

        const updated = await this.workflowsService.findVisibleOrThrow(
          workflowId,
          scope,
        );

        return serializeSingle(
          request,
          WorkflowSerializer,
          withNextRunAt(updated),
        );
      }, 'Failed to update workflow schedule');
    }

    const data = await this.workflowsService.patch(
      workflowId,
      updateWorkflowDto,
    );

    return data
      ? serializeSingle(request, WorkflowSerializer, withNextRunAt(data))
      : returnNotFound(this.constructorName, workflowId);
  }

  @Delete(':workflowId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    const data = await this.workflowsService.remove(workflowId);
    return data
      ? serializeSingle(request, WorkflowSerializer, data)
      : returnNotFound(this.constructorName, workflowId);
  }
}
