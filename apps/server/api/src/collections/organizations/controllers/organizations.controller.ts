import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';
import type { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { SkipRoles } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  OrganizationOption,
} from '@genfeedai/contracts/interfaces';
import { OrganizationSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsController extends BaseCRUDController<
  OrganizationDocument,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryDto
> {
  constructor(
    public readonly loggerService: LoggerService,
    private readonly organizationsService: OrganizationsService,
    private readonly operationsService: OrganizationsOperationsService,
  ) {
    super(
      loggerService,
      organizationsService,
      OrganizationSerializer,
      'Organization',
      ['settings'],
    );
  }

  public override canUserReadEntity(
    user: User,
    entity: OrganizationDocument,
  ): Promise<boolean> {
    return this.operationsService.canUserReadEntity(user, entity);
  }

  @Get('by-slug/:slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBySlug(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const organization = await this.organizationsService.findBySlug(slug);
    const notFound = (): NotFoundException =>
      new NotFoundException({
        message: `Organization with slug "${slug}" not found`,
      });

    if (!organization) {
      throw notFound();
    }

    const canRead = await this.operationsService.canUserReadEntity(
      user,
      organization,
      getIsSuperAdmin(user, request),
    );
    if (!canRead) {
      throw notFound();
    }

    return serializeSingle(request, OrganizationSerializer, organization);
  }

  findAll(
    request: Request,
    user: User,
    query: OrganizationQueryDto & { readonly mine: true },
  ): Promise<OrganizationOption[]>;
  findAll(
    request: Request,
    user: User,
    query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse>;
  @Get()
  @SkipRoles()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse | OrganizationOption[]> {
    const isSuperAdmin = getIsSuperAdmin(user, request);
    if (query.mine || !isSuperAdmin) {
      return this.operationsService.findMine(user);
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data: AggregatePaginateResult<OrganizationDocument> =
      await this.organizationsService.findAll(
        {
          orderBy: handleQuerySort(query.sort),
          where: { isDeleted },
        },
        options,
      );

    return serializeCollection(request, OrganizationSerializer, data);
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override async create(
    @Req() _request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateOrganizationDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.operationsService.createOrganization(
      {
        description: (createDto as { description?: string }).description,
        label: createDto.label,
      },
      user,
    );

    return result as unknown as JsonApiSingleResponse;
  }
}
