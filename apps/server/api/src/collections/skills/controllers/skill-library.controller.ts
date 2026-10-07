import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ArchiveSkillDto,
  CreateScopedSkillDto,
  GrantSkillDto,
  PublishSkillDto,
  RollbackSkillDto,
} from '@api/collections/skills/dto/skill-library.dto';
import {
  parseSkillVersionEmptyQueryV1,
  SkillVersionListQueryDto,
} from '@api/collections/skills/dto/skill-version-query.dto';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  SkillSerializer,
  SkillVersionMetadataSerializer,
  SkillVersionReadSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('skills')
@UseGuards(RolesGuard)
export class SkillLibraryController {
  constructor(private readonly library: SkillLibraryService) {}

  @Get(':id/versions')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async listVersions(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const parsed = SkillVersionListQueryDto.parse(query);
    const page = await this.library.listVersions(this.actor(user), id, parsed);
    return serializeCollection(request, SkillVersionMetadataSerializer, {
      docs: page.items,
      limit: page.limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  }

  @Get(':id/versions/:versionId')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async getVersion(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Query() query: unknown,
  ) {
    parseSkillVersionEmptyQueryV1(query);
    const version = await this.library.getVersion(
      this.actor(user),
      id,
      versionId,
    );
    return serializeSingle(request, SkillVersionReadSerializer, version);
  }

  @Post('scoped')
  async createScopedSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateScopedSkillDto,
  ) {
    const created = await this.library.create(this.actor(user), body);
    const visible = await this.library.present(this.actor(user), [created]);
    return serializeSingle(request, SkillSerializer, visible[0] ?? created);
  }

  @Post(':id/fork')
  async forkSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const forked = await this.library.fork(this.actor(user), id);
    return serializeSingle(request, SkillSerializer, forked);
  }

  @Post(':id/grants')
  grantSkill(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: GrantSkillDto,
  ) {
    return this.library.grant(this.actor(user), id, body);
  }

  @Post(':id/grants/:grantId/revoke')
  revokeGrant(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('grantId') grantId: string,
  ) {
    return this.library.revoke(this.actor(user), id, grantId);
  }

  @Post(':id/publish')
  async publishSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: PublishSkillDto,
  ) {
    const published = await this.library.publish(this.actor(user), id, body);
    return serializeSingle(request, SkillSerializer, published);
  }

  @Post(':id/archive')
  archiveSkill(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ArchiveSkillDto,
  ) {
    return this.library.archive(this.actor(user), id, body);
  }

  @TenantReadPolicy('owner')
  @Get(':id/export')
  exportSkill(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.export(this.actor(user), id);
  }

  @Post(':id/rollback')
  async rollbackSkill(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RollbackSkillDto,
  ) {
    const restored = await this.library.rollback(this.actor(user), id, body);
    return serializeSingle(request, SkillSerializer, restored);
  }

  private actor(user: User) {
    const organizationId = user.organizationId?.toString();
    if (!organizationId || !user.userId) {
      throw new HttpException(
        { detail: 'Organization context is required', title: 'Forbidden' },
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      brandId: user.brandId,
      organizationId,
      userId: user.userId,
    };
  }
}
