import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import { PersonaContentPlanService } from '@api/services/persona-content/persona-content-plan.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { PostCategory } from '@genfeedai/enums';
import { PostSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('personas')
@UseGuards(RolesGuard)
export class PersonasContentController {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly personaContentService: PersonaContentService,
    private readonly personaContentPlanService: PersonaContentPlanService,
    private readonly personaPublisherService: PersonaPublisherService,
    private readonly postsService: PostsService,
  ) {}

  @Post(':id/generate/photo')
  @HttpCode(HttpStatus.OK)
  async generatePhoto(
    @Param('id') id: string,
    @Body() body: { prompt?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const result = await this.personaContentService.generatePhoto({
        organization: EntityIdUtil.toValidId(organization)!,
        personaId: EntityIdUtil.toValidId(id)!,
        prompt: body.prompt,
        user: EntityIdUtil.toValidId(dbUserId)!,
      });

      return { data: result };
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generatePhoto');
    }
  }

  @Post(':id/generate/video')
  @HttpCode(HttpStatus.OK)
  async generateVideo(
    @Param('id') id: string,
    @Body() body: { script: string; aspectRatio?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const result = await this.personaContentService.generateVideo({
        aspectRatio: body.aspectRatio,
        organization: EntityIdUtil.toValidId(organization)!,
        personaId: EntityIdUtil.toValidId(id)!,
        script: body.script,
        user: EntityIdUtil.toValidId(dbUserId)!,
      });

      return { data: result };
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateVideo');
    }
  }

  @Post(':id/generate/voice')
  @HttpCode(HttpStatus.OK)
  async generateVoice(
    @Param('id') id: string,
    @Body() body: { text: string; ingredientId?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const result = await this.personaContentService.generateVoice({
        ingredientId: body.ingredientId
          ? EntityIdUtil.toValidId(body.ingredientId)!
          : undefined,
        organization: EntityIdUtil.toValidId(organization)!,
        personaId: EntityIdUtil.toValidId(id)!,
        text: body.text,
        user: EntityIdUtil.toValidId(dbUserId)!,
      });

      return { data: result };
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateVoice');
    }
  }

  @Post(':id/generate/caption')
  @HttpCode(HttpStatus.OK)
  generateCaption(
    @Param('id') _id: string,
    @Body() body: { topic?: string; platform?: string },
    @CurrentUser() _user: User,
  ) {
    try {
      return {
        data: {
          caption: `Generated caption for topic: ${body.topic ?? 'general'}`,
          platform: body.platform ?? 'default',
        },
      };
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateCaption');
    }
  }

  @Post(':id/content-plan')
  @HttpCode(HttpStatus.OK)
  async generateContentPlan(
    @Param('id') id: string,
    @Body()
    body: { days: number; credentialId?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);

      // Clamp days to safe range [1, 90]
      const days = Math.max(
        1,
        Math.min(90, Math.floor(Number(body.days) || 1)),
      );

      const input = {
        brand: EntityIdUtil.toValidId(brand)!,
        credentialId: body.credentialId
          ? EntityIdUtil.toValidId(body.credentialId)!
          : undefined,
        days,
        organization: EntityIdUtil.toValidId(organization)!,
        personaId: EntityIdUtil.toValidId(id)!,
        user: EntityIdUtil.toValidId(dbUserId)!,
      };

      const plan =
        await this.personaContentPlanService.generateContentPlan(input);

      if (body.credentialId) {
        const created = await this.personaContentPlanService.createDraftPosts(
          input,
          plan.entries,
        );

        return {
          data: { ...plan, draftsCreated: created },
        };
      }

      return { data: plan };
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'generateContentPlan',
      );
    }
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id') id: string,
    @Body()
    body: {
      description: string;
      ingredientIds?: string[];
      category?: PostCategory;
      scheduledDate?: string;
    },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const result = await this.personaPublisherService.publishToAll({
        brand: EntityIdUtil.toValidId(brand)!,
        category: body.category,
        description: body.description,
        ingredientIds: body.ingredientIds?.map(
          (iid) => EntityIdUtil.toValidId(iid)!,
        ),
        organization: EntityIdUtil.toValidId(organization)!,
        personaId: EntityIdUtil.toValidId(id)!,
        scheduledDate: body.scheduledDate
          ? new Date(body.scheduledDate)
          : undefined,
        user: EntityIdUtil.toValidId(dbUserId)!,
      });

      return { data: result };
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'publish');
    }
  }

  @Get(':id/posts')
  async getPersonaPosts(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      // @ts-expect-error TS2554
      const posts = await this.postsService.findAll({
        isDeleted: false,
        limit: Number(limit),
        organization: EntityIdUtil.toValidId(organization)!,
        page: Number(page),
        persona: EntityIdUtil.toValidId(id)!,
      });

      return serializeCollection(
        request,
        PostSerializer,
        posts as unknown as { docs: unknown[]; [key: string]: unknown },
      );
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getPersonaPosts');
    }
  }
}
