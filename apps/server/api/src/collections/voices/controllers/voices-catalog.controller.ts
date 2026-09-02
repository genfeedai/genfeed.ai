import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportVoicesDto } from '@api/collections/voices/dto/import-voices.dto';
import { UpdateVoiceCatalogDto } from '@api/collections/voices/dto/update-voice-catalog.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import {
  parseVoiceCatalogProvider,
  parseVoiceCatalogProviders,
  toVoiceCatalogWireFormat,
} from '@api/collections/voices/utils/voice-provider.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VoiceCatalogEntrySerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('voices')
export class VoicesCatalogController {
  private readonly resourceName = 'VoicesController';

  constructor(
    private readonly externalVoiceCatalogService: ExternalVoiceCatalogService,
  ) {}

  @Get('catalog')
  @ApiOperation({
    operationId: 'VoicesController.findCatalog',
    summary: 'findCatalog',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findCatalog(
    @Req() request: Request,
    @Query('provider') providerQuery?: string,
    @Query('search') search?: string,
  ): Promise<JsonApiCollectionResponse> {
    try {
      const voices = await this.externalVoiceCatalogService.findAll({
        provider: parseVoiceCatalogProvider(providerQuery),
        search,
      });
      const docs = voices.map(toVoiceCatalogWireFormat);

      return serializeCollection(request, VoiceCatalogEntrySerializer, {
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: docs.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: docs.length,
        totalPages: 1,
      });
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find catalog voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('catalog/:id')
  @ApiOperation({
    operationId: 'VoicesController.patchCatalogVoice',
    summary: 'patchCatalogVoice',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patchCatalogVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateVoiceCatalogDto,
  ): Promise<JsonApiSingleResponse> {
    this.assertSuperAdmin(user, request);
    this.validatePatch(id, dto);

    const existing = await this.externalVoiceCatalogService.findOne(id);
    if (!existing) {
      returnNotFound(this.resourceName, id);
    }

    const updated = await this.externalVoiceCatalogService.patch(id, {
      isActive: dto.isActive,
      isDefaultSelectable: dto.isDefaultSelectable,
      isFeatured: dto.isFeatured,
    });
    return serializeSingle(
      request,
      VoiceCatalogEntrySerializer,
      toVoiceCatalogWireFormat(updated),
    );
  }

  @Post('import')
  @ApiOperation({
    operationId: 'VoicesController.importCatalogVoices',
    summary: 'importCatalogVoices',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importCatalogVoices(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ImportVoicesDto,
  ): Promise<{ data: { created: number; updated: number; total: number } }> {
    this.assertSuperAdmin(user, request);
    const result = await this.externalVoiceCatalogService.syncFromProviders(
      parseVoiceCatalogProviders(dto.providers),
    );
    return { data: result };
  }

  private assertSuperAdmin(user: User, request: Request): void {
    if (!getIsSuperAdmin(user, request)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  private validatePatch(id: string, dto: UpdateVoiceCatalogDto): void {
    if (!isEntityId(id)) {
      throw new HttpException(
        { detail: 'Invalid catalog voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      dto.isActive === undefined &&
      dto.isDefaultSelectable === undefined &&
      dto.isFeatured === undefined
    ) {
      throw new HttpException(
        {
          detail: 'At least one catalog voice field must be provided',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
