import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { YoutubeLongFormWorkflowService } from '@api/collections/workflows/services/youtube-long-form-workflow.service';
import { CreatePublicYoutubeLongFormDto } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.dto';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  IngredientSerializer,
  PublicYoutubeLongFormToolSerializer,
} from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller()
export class PublicYoutubeLongFormController {
  constructor(
    private readonly youtubeLongFormWorkflow: YoutubeLongFormWorkflowService,
  ) {}

  @Post('public/youtube-long-form')
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 3, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async create(
    @Req() request: Request,
    @Body() dto: CreatePublicYoutubeLongFormDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.youtubeLongFormWorkflow.runPublic(
      dto.youtubeUrl,
      dto.outputType,
    );
    return serializeSingle(request, PublicYoutubeLongFormToolSerializer, {
      ...result,
      id: result.executionId,
    });
  }

  @Post('youtube-long-form')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  async createAuthenticated(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreatePublicYoutubeLongFormDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.youtubeLongFormWorkflow.runAuthenticated({
      brandId: user.brandId || undefined,
      organizationId: user.organizationId,
      outputType: dto.outputType,
      userId: user.userId ?? user.id,
      youtubeUrl: dto.youtubeUrl,
    });
    return serializeSingle(request, PublicYoutubeLongFormToolSerializer, {
      ...result,
      id: result.contentId,
    });
  }

  @Post('youtube-long-form/:artifactId/source-library')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  async promoteSource(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('artifactId') artifactId: string,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.youtubeLongFormWorkflow.promoteSourceToLibrary({
      artifactId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
    return serializeSingle(request, IngredientSerializer, {
      id: result.ingredientId,
    });
  }
}
