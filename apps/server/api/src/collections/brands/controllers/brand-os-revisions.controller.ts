import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BRAND_OS_EDIT_ROLES } from '@api/collections/brands/constants/brand-os-edit-roles.constant';
import { BrandReadScopes } from '@api/collections/brands/decorators/brand-read-scopes.decorator';
import {
  ApproveBrandOsRevisionDto,
  CreateBrandOsRevisionDto,
  UpdateBrandOsRevisionDto,
} from '@api/collections/brands/dto/brand-os-revision.dto';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { withRequiredTextContext } from '@api/collections/brands/utils/brand-kit-required-context.util';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import { BrandOsRevisionSerializer } from '@genfeedai/serializers';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands/:id/brand-os/revisions')
@UseGuards(RolesGuard)
@BrandReadScopes()
export class BrandOsRevisionsController {
  constructor(private readonly revisions: BrandOsRevisionsService) {}

  @TenantReadPolicy('mutating')
  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const docs = await this.revisions.list(this.organizationId(user), id);
    return serializeCollection(request, BrandOsRevisionSerializer, {
      docs: docs.map(withRequiredTextContext),
    });
  }

  @TenantReadPolicy('selected')
  @Get(':revisionId')
  async get(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      withRequiredTextContext(
        await this.revisions.get(
          this.organizationId(user, resolveTenantReadScope(user)),
          id,
          revisionId,
        ),
      ),
    );
  }

  @Post()
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE)
  @RolesDecorator(...BRAND_OS_EDIT_ROLES)
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateBrandOsRevisionDto,
  ) {
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      withRequiredTextContext(
        await this.revisions.create(
          this.writeOrganizationId(user),
          id,
          dto.content,
        ),
      ),
    );
  }

  @Patch(':revisionId')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE)
  @RolesDecorator(...BRAND_OS_EDIT_ROLES)
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: UpdateBrandOsRevisionDto,
  ) {
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      withRequiredTextContext(
        await this.revisions.update(
          this.writeOrganizationId(user),
          id,
          revisionId,
          dto.content,
          dto.updatedAt,
        ),
      ),
    );
  }

  @Post(':revisionId/approve')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE)
  @HttpCode(200)
  @RolesDecorator(...BRAND_OS_EDIT_ROLES)
  async approve(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: ApproveBrandOsRevisionDto,
  ) {
    const userId = user.userId ?? user.id;
    if (!userId) throw new ForbiddenException('User context is required');
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      withRequiredTextContext(
        await this.revisions.approve(
          this.writeOrganizationId(user),
          id,
          revisionId,
          userId,
          dto.updatedAt,
          dto.reviewedGenerationRulesHash,
        ),
      ),
    );
  }

  /**
   * Writes belong to the organization the request is pinned to. For a verified
   * super admin that is the `?organizationId=` override; everyone else is
   * pinned to the session organization, so the value is the same as before.
   * Reading the session organization here made the Prisma tenant guard reject
   * an overridden write (#11066).
   */
  private writeOrganizationId(user: User): string {
    const organizationId =
      getTenantContext()?.organizationId ?? user.organizationId;
    if (!organizationId)
      throw new ForbiddenException('Organization context is required');
    return organizationId;
  }

  private organizationId(user: User, readScope?: ITenantReadScope): string {
    if (!(readScope?.organizationId ?? user.organizationId))
      throw new ForbiddenException('Organization context is required');
    return readScope?.organizationId ?? user.organizationId;
  }
}
