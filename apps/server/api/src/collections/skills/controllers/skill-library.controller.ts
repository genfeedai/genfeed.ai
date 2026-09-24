import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ArchiveSkillDto,
  CreateScopedSkillDto,
  GrantSkillDto,
  PublishSkillDto,
  RollbackSkillDto,
} from '@api/collections/skills/dto/skill-library.dto';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SkillSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('skills')
@UseGuards(RolesGuard)
export class SkillLibraryController {
  constructor(private readonly library: SkillLibraryService) {}

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
