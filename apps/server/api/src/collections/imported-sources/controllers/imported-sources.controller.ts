import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ImportedSourcesQueryDto,
  RecaptureImportedSourceDto,
  SaveImportedSourceDto,
} from '@api/collections/imported-sources/dto/imported-source.dto';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { API_KEY_BRAND_EDIT_SCOPES } from '@api/helpers/utils/auth/api-key-route-scope-sets.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ImportedSourceSerializer } from '@genfeedai/serializers';
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
@Controller('brands/:brandId/imported-sources')
@UseGuards(RolesGuard)
export class ImportedSourcesController {
  constructor(private readonly sources: ImportedSourcesService) {}
  @Post()
  @RequiredScopes(...API_KEY_BRAND_EDIT_SCOPES)
  @HttpCode(HttpStatus.CREATED)
  async save(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() body: SaveImportedSourceDto,
  ) {
    return serializeSingle(
      request,
      ImportedSourceSerializer,
      await this.sources.save(user, brandId, body),
    );
  }
  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: ImportedSourcesQueryDto,
  ) {
    return serializeCollection(
      request,
      ImportedSourceSerializer,
      await this.sources.list(user, brandId, query),
    );
  }
  @TenantReadPolicy('selected')
  @Get(':id')
  async get(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    return serializeSingle(
      request,
      ImportedSourceSerializer,
      await this.sources.get(user, brandId, id, resolveTenantReadScope(user)),
    );
  }
  @Post(':id/recaptures')
  @RequiredScopes(...API_KEY_BRAND_EDIT_SCOPES)
  @HttpCode(HttpStatus.CREATED)
  async recapture(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('id') id: string,
    @Body() body: RecaptureImportedSourceDto,
  ) {
    return serializeSingle(
      request,
      ImportedSourceSerializer,
      await this.sources.recapture(user, brandId, id, body),
    );
  }
}
