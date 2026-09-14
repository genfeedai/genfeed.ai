import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ApproveBrandOsRevisionDto,
  CreateBrandOsRevisionDto,
  UpdateBrandOsRevisionDto,
} from '@api/collections/brands/dto/brand-os-revision.dto';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
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
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands/:id/brand-os/revisions')
@UseGuards(RolesGuard)
export class BrandOsRevisionsController {
  constructor(private readonly revisions: BrandOsRevisionsService) {}

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const docs = await this.revisions.list(this.organizationId(user), id);
    return serializeCollection(request, BrandOsRevisionSerializer, { docs });
  }

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
      await this.revisions.get(this.organizationId(user), id, revisionId),
    );
  }

  @Post()
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateBrandOsRevisionDto,
  ) {
    return serializeSingle(
      request,
      BrandOsRevisionSerializer,
      await this.revisions.create(this.organizationId(user), id, dto.content),
    );
  }

  @Patch(':revisionId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
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
      await this.revisions.update(
        this.organizationId(user),
        id,
        revisionId,
        dto.content,
        dto.updatedAt,
      ),
    );
  }

  @Post(':revisionId/approve')
  @HttpCode(200)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
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
      await this.revisions.approve(
        this.organizationId(user),
        id,
        revisionId,
        userId,
        dto.updatedAt,
      ),
    );
  }

  private organizationId(user: User): string {
    if (!user.organizationId)
      throw new ForbiddenException('Organization context is required');
    return user.organizationId;
  }
}
