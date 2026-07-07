import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowQueryDto } from '@api/collections/workflows/dto/query-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SYSTEM_WORKFLOW_METADATA_KEY } from '@api/collections/workflows/system-workflow.contract';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
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

type WorkflowStatistics = Awaited<
  ReturnType<WorkflowsService['getWorkflowStatistics']>
>;

/**
 * Standard workflow CRUD (+ statistics and ComfyUI export). Registered LAST
 * among the workflow controllers so its `:workflowId` param route never
 * shadows the literal routes (templates, statistics, batch, marketplace, …)
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
      const publicMetadata = getPublicMetadata(user);

      const workflow = await this.workflowsService.createWorkflow(
        publicMetadata.user,
        publicMetadata.organization,
        createWorkflowDto,
        publicMetadata.brand || undefined,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to create workflow');
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: WorkflowQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // `referencable=true` widens the list to every workflow in the org (used to
    // seed workflow-reference pickers). Collapsed from the former
    // `GET /workflows/referencable` route (#1354).
    const where = query.referencable
      ? {
          isDeleted,
          organization: publicMetadata.organization,
        }
      : {
          isDeleted,
          organization: publicMetadata.organization,
          OR: [
            { user: publicMetadata.user },
            {
              metadata: {
                equals: 'organization',
                path: [SYSTEM_WORKFLOW_METADATA_KEY, 'visibility'],
              },
            },
          ],
        };

    const aggregate = {
      where,
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<WorkflowDocument> =
      await this.workflowsService.findAll(aggregate, options);
    return serializeCollection(request, WorkflowSerializer, data);
  }

  @Get('statistics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getStatistics(
    @CurrentUser() user: User,
  ): Promise<{ data: WorkflowStatistics }> {
    const publicMetadata = getPublicMetadata(user);
    const stats = await this.workflowsService.getWorkflowStatistics(
      publicMetadata.user,
      publicMetadata.organization,
    );

    return { data: stats };
  }

  @Get(':workflowId/export-comfyui')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async exportComfyUI(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: Record<string, unknown> | null }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
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
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findVisibleOrThrow(
      workflowId,
      {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
    );

    return serializeSingle(request, WorkflowSerializer, workflow);
  }

  @Post(':workflowId/clone')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cloneWorkflow(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);

      const clonedWorkflow = await this.workflowsService.cloneWorkflow(
        workflowId,
        publicMetadata.user,
        publicMetadata.organization,
        publicMetadata.brand || undefined,
      );

      return serializeSingle(request, WorkflowSerializer, clonedWorkflow);
    }, 'Failed to clone workflow');
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
    const publicMetadata = getPublicMetadata(user);

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
          publicMetadata.user,
          publicMetadata.organization,
        );

        return serializeSingle(request, WorkflowSerializer, workflow);
      }, 'Failed to publish workflow to marketplace');
    }

    const workflow = await this.workflowsService.findMutableOwnedOrThrow(
      workflowId,
      {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
    );

    // Schedule change: register/unregister the BullMQ cron via the scheduler,
    // not just a plain column write. Any non-schedule fields in the same body
    // are still patched.
    const touchesSchedule =
      Object.hasOwn(updateWorkflowDto, 'schedule') ||
      Object.hasOwn(updateWorkflowDto, 'timezone') ||
      Object.hasOwn(updateWorkflowDto, 'isScheduleEnabled');

    if (touchesSchedule) {
      return wrapError(async () => {
        const { schedule, timezone, isScheduleEnabled, ...rest } =
          updateWorkflowDto;

        if (Object.keys(rest).length > 0) {
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

        const updated = await this.workflowsService.findOwnedOrThrow(
          workflowId,
          {
            organization: publicMetadata.organization,
            user: publicMetadata.user,
          },
        );

        return serializeSingle(request, WorkflowSerializer, updated);
      }, 'Failed to update workflow schedule');
    }

    const data = await this.workflowsService.patch(
      workflowId,
      updateWorkflowDto,
    );

    return data
      ? serializeSingle(request, WorkflowSerializer, data)
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
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const data = await this.workflowsService.remove(workflowId);
    return data
      ? serializeSingle(request, WorkflowSerializer, data)
      : returnNotFound(this.constructorName, workflowId);
  }
}
