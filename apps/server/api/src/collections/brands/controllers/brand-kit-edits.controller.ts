import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BRAND_OS_EDIT_ROLES } from '@api/collections/brands/constants/brand-os-edit-roles.constant';
import { ApproveBrandKitDto } from '@api/collections/brands/dto/approve-brand-kit.dto';
import {
  type UpdateBrandAgentConfigDto,
  UpdateBrandAgentStrategyDto,
  UpdateBrandAgentVoiceDto,
} from '@api/collections/brands/dto/update-brand-agent-config.dto';
import { UpdateBrandKitIdentityDto } from '@api/collections/brands/dto/update-brand-kit-identity.dto';
import { UpdateBrandKitVisualIdentityDto } from '@api/collections/brands/dto/update-brand-kit-visual-identity.dto';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  RolesGuard,
  type RolesGuardRequest,
} from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, BrandOsRevisionStatus } from '@genfeedai/contracts';
import {
  BrandOsRevisionSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

class BrandKitWritingVoiceDto extends UpdateBrandAgentVoiceDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
}

class BrandKitStrategyDto extends UpdateBrandAgentStrategyDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
}

@AutoSwagger()
@Controller('brands/:id/brand-kit')
export class BrandKitEditsController {
  constructor(
    private readonly brands: BrandsService,
    private readonly revisions: BrandOsRevisionsService,
    private readonly roles: RolesGuard,
  ) {}

  @Patch('visual-identity')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  async visualIdentity(
    @Req() request: Request & RolesGuardRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
    @Body() dto: UpdateBrandKitVisualIdentityDto,
  ) {
    await this.assertOwnerOrAdmin(
      request,
      user,
      brandId,
      'edit visual identity',
    );
    const revision = await this.revisions.applyVisualIdentity(
      user.organizationId,
      brandId,
      dto,
    );
    await this.brands.invalidateBrandContextCaches(
      brandId,
      user.organizationId,
    );
    return serializeSingle(request, BrandOsRevisionSerializer, revision);
  }

  @Patch('identity')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  async identity(
    @Req() request: Request & RolesGuardRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
    @Body() dto: UpdateBrandKitIdentityDto,
  ) {
    await this.assertOwnerOrAdmin(
      request,
      user,
      brandId,
      'edit the brand name',
    );
    const revision = await this.revisions.applyIdentity(
      user.organizationId,
      brandId,
      dto,
    );
    await this.brands.invalidateBrandContextCaches(
      brandId,
      user.organizationId,
    );
    return serializeSingle(request, BrandOsRevisionSerializer, revision);
  }

  /** The draft an owner or admin is about to approve, for the confirm step. */
  @Get('approval')
  @TenantReadPolicy('mutating')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  async approvalDraft(
    @Req() request: Request & RolesGuardRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
  ) {
    await this.assertOwnerOrAdmin(
      request,
      user,
      brandId,
      'approve the Brand Kit',
    );
    const draft = (
      await this.revisions.list(user.organizationId, brandId)
    ).find((revision) => revision.status === BrandOsRevisionStatus.DRAFT);
    if (!draft)
      throw new BadRequestException(
        'No Brand Kit draft is waiting for approval',
      );
    return serializeSingle(request, BrandOsRevisionSerializer, draft);
  }

  /**
   * Approves the draft the owner reviewed. A draft that carries generation
   * rules is approved in the web app, where the rules are read in full.
   */
  @Post('approve')
  @HttpCode(200)
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  async approve(
    @Req() request: Request & RolesGuardRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
    @Body() dto: ApproveBrandKitDto,
  ) {
    await this.assertOwnerOrAdmin(
      request,
      user,
      brandId,
      'approve the Brand Kit',
    );
    const userId = user.userId ?? user.id;
    if (!userId) throw new ForbiddenException('User context is required');
    const draft = await this.revisions.get(
      user.organizationId,
      brandId,
      dto.revisionId,
    );
    if (draft.content.generationRules !== undefined)
      throw new ConflictException(
        'This draft carries generation rules. Review and approve it in the Genfeed web app (Settings, Brand Kit).',
      );
    const name = draft.content.fields.label?.currentValue;
    if (typeof name !== 'string' || !name.trim())
      throw new BadRequestException(
        'Set the brand name before approving the Brand Kit',
      );
    const revision = await this.revisions.approve(
      user.organizationId,
      brandId,
      dto.revisionId,
      userId,
      dto.updatedAt,
    );
    await this.brands.invalidateBrandContextCaches(
      brandId,
      user.organizationId,
    );
    return serializeSingle(request, BrandOsRevisionSerializer, revision);
  }

  @Patch('writing-voice')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  writingVoice(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
    @Body() dto: BrandKitWritingVoiceDto,
  ) {
    return this.saveAgentConfig(request, user, brandId, dto, { voice: dto });
  }

  @Patch('strategy')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE, ApiKeyScope.BRAND_KIT_WRITE)
  strategy(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') brandId: string,
    @Body() dto: BrandKitStrategyDto,
  ) {
    return this.saveAgentConfig(request, user, brandId, dto, { strategy: dto });
  }

  private async assertOwnerOrAdmin(
    request: Request & RolesGuardRequest,
    user: AuthenticatedUser,
    brandId: string,
    action: string,
  ) {
    const { hasBrandKitGrant, membershipRole } =
      await this.brands.brandAccessService.assertBrandKitEdit(user, brandId);
    if (!hasBrandKitGrant) {
      await this.roles.assertRoles(request, BRAND_OS_EDIT_ROLES);
      return;
    }
    if (!membershipRole || !BRAND_OS_EDIT_ROLES.includes(membershipRole))
      throw new ForbiddenException(
        `Only organization owners and admins can ${action}`,
      );
  }

  private async saveAgentConfig(
    request: Request,
    user: AuthenticatedUser,
    brandId: string,
    fields: BrandKitWritingVoiceDto | BrandKitStrategyDto,
    agentConfig: Pick<UpdateBrandAgentConfigDto, 'voice' | 'strategy'>,
  ) {
    await this.brands.brandAccessService.assertBrandKitEdit(user, brandId);
    if (
      !fields ||
      Object.values(fields).every((value) => value === undefined)
    ) {
      throw new BadRequestException('At least one Brand Kit field is required');
    }
    const brand = await this.brands.updateAgentConfig(
      brandId,
      user.organizationId,
      agentConfig,
    );
    if (!brand) throw new NotFoundException('Brand', brandId);
    return serializeSingle(request, BrandSerializer, brand);
  }
}
