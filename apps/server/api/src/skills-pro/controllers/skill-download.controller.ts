import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OptionalAuth } from '@api/helpers/decorators/optional-auth.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { DownloadSkillDto } from '@api/skills-pro/dto/download-skill.dto';
import { VerifyReceiptDto } from '@api/skills-pro/dto/verify-receipt.dto';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { SkillsProInstallationSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillDownloadController {
  constructor(private readonly skillDownloadService: SkillDownloadService) {}

  @OptionalAuth()
  @Post('verify')
  @ApiOperation({
    summary:
      'Verify a skill receipt secret and return entitled skills without an app session',
  })
  verifyReceipt(
    @CurrentUser() user: User | undefined,
    @Body() dto: VerifyReceiptDto,
  ) {
    const organizationId = this.readOrganizationId(user);
    if (!organizationId) {
      return this.skillDownloadService.verifyReceiptBearer(dto.receiptId);
    }

    return this.skillDownloadService.verifyReceipt(
      organizationId,
      dto.receiptId,
    );
  }

  @OptionalAuth()
  @Post('download')
  @ApiOperation({
    summary:
      'Get a presigned download URL for a purchased skill using the receipt secret',
  })
  downloadSkill(
    @CurrentUser() user: User | undefined,
    @Body() dto: DownloadSkillDto,
  ) {
    const organizationId = this.readOrganizationId(user);
    if (!organizationId) {
      return this.skillDownloadService.getDownloadUrlBearer(
        dto.receiptId,
        dto.skillSlug,
      );
    }

    return this.skillDownloadService.getDownloadUrl(
      organizationId,
      dto.receiptId,
      dto.skillSlug,
    );
  }

  @Post('install')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify and install a purchased skill into this organization',
  })
  async installSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: DownloadSkillDto,
  ) {
    const installed = await this.skillDownloadService.installSkill(
      this.requireOrganizationId(user),
      dto.receiptId,
      dto.skillSlug,
    );

    return serializeSingle(request, SkillsProInstallationSerializer, installed);
  }

  private readOrganizationId(user: User | undefined): string | undefined {
    const organizationId = user?.organizationId?.toString().trim();
    return organizationId || undefined;
  }

  private requireOrganizationId(user: User): string {
    const organizationId = user.organizationId?.toString();

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return organizationId;
  }
}
