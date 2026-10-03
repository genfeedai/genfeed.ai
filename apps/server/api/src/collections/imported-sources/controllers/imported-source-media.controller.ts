import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  RetryImportedSourceMediaDto,
  StartImportedSourceMediaDto,
} from '@api/collections/imported-sources/dto/imported-source-media.dto';
import { ImportedSourceMediaService } from '@api/collections/imported-sources/services/imported-source-media.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ImportedSourceMediaSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
@Controller('brands/:brandId/imported-sources/:id/media')
@UseGuards(RolesGuard)
export class ImportedSourceMediaController {
  constructor(private readonly media: ImportedSourceMediaService) {}
  @Post()
  @HttpCode(200)
  async start(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
    @Body() body: StartImportedSourceMediaDto,
  ) {
    return serializeSingle(
      request,
      ImportedSourceMediaSerializer,
      await this.media.start(user, brandId, id, body),
    );
  }
  @Get()
  @HttpCode(200)
  async observe(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      ImportedSourceMediaSerializer,
      await this.media.observe(user, brandId, id),
    );
  }
  @Post('retry')
  @HttpCode(200)
  async retry(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
    @Body() body: RetryImportedSourceMediaDto,
  ) {
    return serializeSingle(
      request,
      ImportedSourceMediaSerializer,
      await this.media.retry(user, brandId, id, body),
    );
  }
}
