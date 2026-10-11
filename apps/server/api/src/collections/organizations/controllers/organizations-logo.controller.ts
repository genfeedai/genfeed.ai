import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationLogoGenerationService } from '@api/collections/organizations/services/organization-logo-generation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ActivitySource, MemberRole } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsLogoController {
  constructor(
    private readonly logoGenerationService: OrganizationLogoGenerationService,
  ) {}

  /**
   * Generates the organization logo from a fixed preset (no caller prompt).
   * Fire-and-forget: the image is produced asynchronously and attached by the
   * Replicate webhook. Credits are charged to the caller's active organization
   * only after generation has started (same flow and price as brand logos).
   */
  @Post(':organizationId/logo/generate')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @Credits({
    amount: 200, // same price as brand logo generation (POST /assets/generate)
    description: 'Organization logo generation',
    source: ActivitySource.ASSET_GENERATION,
  })
  @UseGuards(CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'OrganizationsController.generateLogo',
    summary: 'generateLogo',
  })
  async generateLogo(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    // Credits are debited from the session's organization, so the target must
    // be exactly that organization (never a different tenant's logo).
    if (!user.organizationId || user.organizationId !== organizationId) {
      throw new NotFoundException('Organization', organizationId);
    }

    const asset = await this.logoGenerationService.generate(
      organizationId,
      user,
    );

    return serializeSingle(request, AssetSerializer, asset);
  }
}
