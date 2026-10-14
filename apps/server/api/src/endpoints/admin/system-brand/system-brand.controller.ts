import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UpdateBrandOsRevisionDto } from '@api/collections/brands/dto/brand-os-revision.dto';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import {
  runAsSystemOrganization,
  SYSTEM_BRAND_ID,
  SystemBrandService,
} from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { ApproveSystemBrandDto } from '@api/endpoints/admin/system-brand/dto/approve-system-brand.dto';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandOsRevisionSerializer } from '@genfeedai/serializers';
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * The system organization has no members, so its one brand cannot be reviewed
 * through the member-scoped Brand OS routes. A platform admin edits and
 * approves the Genfeed system brand's kit here, once.
 */
@ApiTags('Admin / System Brand')
@Controller('admin/system-brand')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class SystemBrandController {
  constructor(
    private readonly systemBrand: SystemBrandService,
    private readonly revisions: BrandOsRevisionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the Genfeed system brand revision, creating it on first use',
  })
  async get(@Req() request: Request) {
    const { revision } = await this.systemBrand.ensure();
    return serializeSingle(request, BrandOsRevisionSerializer, revision);
  }

  @Patch('revisions/:revisionId')
  @ApiOperation({ summary: 'Edit the system brand kit draft' })
  async update(
    @Req() request: Request,
    @Param('revisionId') revisionId: string,
    @Body() dto: UpdateBrandOsRevisionDto,
  ) {
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      await runAsSystemOrganization(() =>
        this.revisions.update(
          SYSTEM_WORKFLOW_PRINCIPAL_ID,
          SYSTEM_BRAND_ID,
          revisionId,
          dto.content,
          dto.updatedAt,
        ),
      ),
    );
  }

  @Post('revisions/:revisionId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Approve the edited system brand kit; internal output is then generated against an approved brand',
  })
  async approve(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('revisionId') revisionId: string,
    @Body() dto: ApproveSystemBrandDto,
  ) {
    const userId = user.userId ?? user.id;
    if (!userId) throw new ForbiddenException('User context is required');
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      await runAsSystemOrganization(async () => {
        const { content } = await this.revisions.get(
          SYSTEM_WORKFLOW_PRINCIPAL_ID,
          SYSTEM_BRAND_ID,
          revisionId,
        );
        // The updatedAt fence already pins the reviewed draft, so the rules digest is derived from it.
        return this.revisions.approve(
          SYSTEM_WORKFLOW_PRINCIPAL_ID,
          SYSTEM_BRAND_ID,
          revisionId,
          userId,
          dto.updatedAt,
          content.generationRules === undefined
            ? undefined
            : hashBrandGenerationRulesReviewV1(content.generationRules),
        );
      }),
    );
  }
}
