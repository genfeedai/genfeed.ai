import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BRAND_OS_EDIT_ROLES } from '@api/collections/brands/controllers/brand-access.helpers';
import {
  type UpdateBrandAgentConfigDto,
  UpdateBrandAgentStrategyDto,
  UpdateBrandAgentVoiceDto,
} from '@api/collections/brands/dto/update-brand-agent-config.dto';
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
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import {
  BrandOsRevisionSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Patch,
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
    const { hasBrandKitGrant, membershipRole } =
      await this.brands.brandAccessService.assertBrandKitEdit(user, brandId);
    if (hasBrandKitGrant) {
      if (!membershipRole || !BRAND_OS_EDIT_ROLES.includes(membershipRole)) {
        throw new ForbiddenException(
          'Only organization owners and admins can edit visual identity',
        );
      }
    } else {
      await this.roles.assertRoles(request, BRAND_OS_EDIT_ROLES);
    }
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
