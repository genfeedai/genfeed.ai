import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsScanDto } from '@api/collections/brands/dto/brand-os-scan.dto';
import { BrandOsScanService } from '@api/collections/brands/services/brand-os-scan.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import { BrandOnboardingScanSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands/:id/brand-os/scan')
@UseGuards(RolesGuard)
export class BrandOsScanController {
  constructor(private readonly scans: BrandOsScanService) {}
  @Post()
  @HttpCode(200)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async start(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BrandOsScanDto,
  ) {
    return serializeSingle(
      request,
      BrandOnboardingScanSerializer,
      await this.scans.start({
        organizationId: this.organizationId(user),
        brandId: id,
        url: dto.url,
        requestId: dto.requestId,
      }),
    );
  }
  @Get()
  async get(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      BrandOnboardingScanSerializer,
      await this.scans.get(this.organizationId(user), id),
    );
  }
  private organizationId(user: User): string {
    if (!user.organizationId)
      throw new ForbiddenException('Organization context is required');
    return user.organizationId;
  }
}
