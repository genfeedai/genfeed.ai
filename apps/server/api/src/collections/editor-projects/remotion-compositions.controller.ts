import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { RenderRemotionCompositionDto } from '@api/collections/editor-projects/dto/render-remotion-composition.dto';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  RemotionCompositionSerializer,
  RemotionRenderSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('remotion-compositions')
@ApiBearerAuth()
@Controller('remotion-compositions')
@UseGuards(RolesGuard)
export class RemotionCompositionsController {
  constructor(private readonly compositions: RemotionCompositionsService) {}

  @Get()
  catalog(@Req() request: Request) {
    return serializeCollection(request, RemotionCompositionSerializer, {
      docs: this.compositions.catalog(),
    });
  }

  @Post('render')
  async render(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RenderRemotionCompositionDto,
  ) {
    return serializeSingle(
      request,
      RemotionRenderSerializer,
      await this.compositions.render(user, input),
    );
  }

  @Get(':id')
  async status(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      RemotionRenderSerializer,
      await this.compositions.status(user, id),
    );
  }

  @Post(':id/cancel')
  async cancel(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      RemotionRenderSerializer,
      await this.compositions.cancel(user, id),
    );
  }

  @Post(':id/retry')
  async retry(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      RemotionRenderSerializer,
      await this.compositions.retry(user, id),
    );
  }
}
