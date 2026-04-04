import type {
  CreateSkillDto,
  CustomizeSkillDto,
  ImportSkillDto,
  UpdateSkillDto,
} from '@api/collections/skills/dto/skill.dto';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { SkillSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('skills')
  async listSkills(@Req() req: Request, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);

    const docs = await this.skillsService.listAllForOrg(organization);

    return serializeCollection(req, SkillSerializer, { docs });
  }

  @Get('skills/:slug')
  async getSkill(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('slug') idOrSlug: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const data = await this.skillsService.getSkillById(organization, idOrSlug);

    return serializeSingle(req, SkillSerializer, data);
  }

  @Post('skills')
  async createSkill(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() body: CreateSkillDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.skillsService.createSkill(organization, body);

    return serializeSingle(req, SkillSerializer, data);
  }

  @Post('skills/import')
  async importSkill(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() body: ImportSkillDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.skillsService.importSkill(organization, body);

    return serializeSingle(req, SkillSerializer, data);
  }

  @Post('skills/:id/customize')
  async customizeSkill(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CustomizeSkillDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.skillsService.customizeSkill(
      organization,
      id,
      body,
    );

    return serializeSingle(req, SkillSerializer, data);
  }

  @Patch('skills/:id')
  async updateSkill(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateSkillDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.skillsService.updateSkill(organization, id, body);

    return serializeSingle(req, SkillSerializer, data);
  }
}
