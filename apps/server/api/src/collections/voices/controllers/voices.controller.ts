import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { ImportVoicesDto } from '@api/collections/voices/dto/import-voices.dto';
import { UpdateVoiceCatalogDto } from '@api/collections/voices/dto/update-voice-catalog.dto';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import {
  ActivitySource,
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import type { ExternalVoice } from '@genfeedai/prisma';
import {
  VoiceCatalogEntrySerializer,
  VoiceCloneSerializer,
  VoiceSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

/**
 * Wire-format document shape expected by VoiceCatalogEntrySerializer.
 * Maps ExternalVoice Prisma field names to backward-compatible wire names.
 */
interface VoiceCatalogEntryDocument {
  _id: string;
  provider: string;
  externalVoiceId: string;
  name: string;
  sampleAudioUrl: string | null;
  language: string | null;
  isActive: boolean;
  isDefaultSelectable: boolean;
  isFeatured: boolean;
  providerData: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toWireFormat(voice: ExternalVoice): VoiceCatalogEntryDocument {
  return {
    _id: voice.id,
    createdAt: voice.createdAt,
    externalVoiceId: voice.externalId,
    isActive: voice.isActive,
    isDefaultSelectable: voice.isDefaultSelectable,
    isFeatured: voice.isFeatured,
    language: voice.language,
    name: voice.name,
    providerData: voice.providerData,
    provider: voice.externalProvider,
    sampleAudioUrl: voice.sampleAudioUrl,
    updatedAt: voice.updatedAt,
  };
}

@AutoSwagger()
@Controller('voices')
export class VoicesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly externalVoiceCatalogService: ExternalVoiceCatalogService,
    private readonly fleetService: FleetService,
    private readonly heygenService: HeyGenService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly notificationsPublisherService: NotificationsPublisherService,
    private readonly sharedService: SharedService,
    private readonly voicesService: VoicesService,
  ) {}

  /**
   * GET /voices
   * Returns user-owned voice ingredients (cloned + generated), scoped to the
   * calling user's brand and organization. Catalog voices are served by
   * GET /voices/catalog instead.
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Query() query: VoicesQueryDto,
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      const publicMetadata = getPublicMetadata(user);
      const brand = publicMetadata.brand;
      const organization = publicMetadata.organization;
      const normalizedSearch = query.search?.trim();
      const sort = query.sort || 'metadata.label: 1, createdAt: -1';

      // Only cloned/generated voices — catalog lives in ExternalVoice, not here.
      const match: Record<string, unknown> = {
        OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
        brandId: brand,
        category: IngredientCategory.VOICE,
        isDeleted: false,
        organizationId: organization,
      };

      if (query.isDefault !== undefined) {
        match.isDefault = Boolean(query.isDefault);
      }

      if (query.isActive !== undefined) {
        match.isVoiceActive = query.isActive ? { not: false } : false;
      }

      const requestedProviders = this.parseProviders(query.providers);
      if (requestedProviders.length > 0) {
        match.voiceProvider = { in: requestedProviders };
      }

      if (normalizedSearch) {
        match.AND = [
          {
            OR: [
              {
                label: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                externalVoiceId: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                voiceProvider: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            ],
          },
        ];
      }

      const data: AggregatePaginateResult<IngredientDocument> =
        await this.voicesService.findAll(
          {
            orderBy: handleQuerySort(sort),
            where: match,
          },
          options,
        );
      return serializeCollection(request, VoiceSerializer, data);
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /voices/catalog
   * Returns the ExternalVoice provider catalog (ElevenLabs, HeyGen).
   * No brand/org scope — catalog is global reference data.
   */
  @Get('catalog')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findCatalog(
    @Req() request: Request,
    @Query('provider') providerQuery?: string,
    @Query('search') search?: string,
  ): Promise<JsonApiCollectionResponse> {
    try {
      const provider = this.parseSingleProvider(providerQuery);

      const voices = await this.externalVoiceCatalogService.findAll({
        provider,
        search,
      });

      const wireDocuments = voices.map(toWireFormat);

      return serializeCollection(request, VoiceCatalogEntrySerializer, {
        docs: wireDocuments,
        page: 1,
        limit: wireDocuments.length,
        totalDocs: wireDocuments.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        pagingCounter: 1,
        nextPage: null,
        prevPage: null,
      });
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find catalog voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /voices/catalog/:id
   * Update catalog voice flags (isActive, isDefaultSelectable, isFeatured).
   * Super-admin only.
   */
  @Patch('catalog/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patchCatalogVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateVoiceCatalogDto,
  ): Promise<JsonApiSingleResponse> {
    if (!getIsSuperAdmin(user, request)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    if (!isEntityId(id)) {
      throw new HttpException(
        { detail: 'Invalid catalog voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.externalVoiceCatalogService.findOne(id);

    if (!existing) {
      return returnNotFound(this.constructorName, id);
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

    const updated = await this.externalVoiceCatalogService.patch(id, {
      isActive: dto.isActive,
      isDefaultSelectable: dto.isDefaultSelectable,
      isFeatured: dto.isFeatured,
    });

    return serializeSingle(
      request,
      VoiceCatalogEntrySerializer,
      toWireFormat(updated),
    );
  }

  /**
   * POST /voices/import
   * Synchronously syncs the provider voice catalog into ExternalVoice.
   * Super-admin only.
   */
  @Post('import')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importCatalogVoices(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ImportVoicesDto,
  ): Promise<{ data: { created: number; updated: number; total: number } }> {
    if (!getIsSuperAdmin(user, request)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const providers = this.parseCatalogProviders(dto.providers);
    const result =
      await this.externalVoiceCatalogService.syncFromProviders(providers);

    return { data: result };
  }

  @Post('generate')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @Credits({
    description: 'Voice generation (TTS)',
    source: ActivitySource.VOICE_GENERATION,
  })
  @RateLimit({ limit: 30, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() generateVoiceDto: GenerateVoiceDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!generateVoiceDto.text) {
      throw new HttpException(
        {
          detail: 'Text is required',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!generateVoiceDto.voiceId) {
      throw new HttpException(
        {
          detail: 'voiceId is required',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const publicMetadata = getPublicMetadata(user);

    // Create ingredient record with PROCESSING status
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      extension: MetadataExtension.MP3,
      organization: publicMetadata.organization,
      status: IngredientStatus.PROCESSING,
      voiceSource: 'generated',
    });

    try {
      // Generate TTS audio via ElevenLabs (synchronous — typically 5-10s)
      const result = await this.elevenLabsService.generateAndUploadAudio(
        generateVoiceDto.voiceId,
        generateVoiceDto.text,
        ingredientData._id.toString(),
        publicMetadata.organization,
        publicMetadata.user,
      );

      // Update ingredient to GENERATED with audio URL and duration
      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(ingredientData._id) },
            { mongoId: String(ingredientData._id) },
          ],
        },
        {
          duration: result.duration,
          status: IngredientStatus.GENERATED,
          url: result.audioUrl,
        },
      );

      // Fetch the updated ingredient with population
      const completedIngredient = await this.voicesService.findOne(
        { _id: ingredientData._id },
        [PopulatePatterns.metadataFull],
      );

      if (!completedIngredient) {
        throw new HttpException(
          {
            detail: `Ingredient ${ingredientData._id} not found after generation`,
            title: 'Generation error',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return serializeSingle(request, VoiceSerializer, completedIngredient);
    } catch (error: unknown) {
      this.loggerService.error(`${url} voice generation failed`, error);

      // Mark ingredient as failed
      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(ingredientData._id) },
            { mongoId: String(ingredientData._id) },
          ],
        },
        { status: IngredientStatus.FAILED },
      );

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Voice generation failed',
          title: 'Generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('clone')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(
    CreditsInterceptor,
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @Credits({
    description: 'Voice cloning',
    source: ActivitySource.VOICE_GENERATION,
  })
  @RateLimit({ limit: 10, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cloneVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() cloneVoiceDto: CloneVoiceDto,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
        allowedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/aac',
          'audio/flac',
          'audio/ogg',
          'audio/webm',
        ],
        maxSizeBytes: 25 * 1024 * 1024,
        required: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!file && !cloneVoiceDto.audioUrl) {
      throw new HttpException(
        {
          detail: 'Either an audio file or audioUrl is required',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const publicMetadata = getPublicMetadata(user);
    const provider = cloneVoiceDto.provider ?? VoiceProvider.ELEVENLABS;

    try {
      if (provider === VoiceProvider.ELEVENLABS) {
        return await this.cloneVoiceElevenLabs(
          request,
          user,
          cloneVoiceDto,
          file,
          publicMetadata,
          url,
        );
      }

      if (provider === VoiceProvider.GENFEED_AI) {
        return await this.cloneVoiceGenfeedAi(
          request,
          user,
          cloneVoiceDto,
          file,
          publicMetadata,
          url,
        );
      }

      throw new HttpException(
        {
          detail: `Unsupported voice clone provider: ${provider}`,
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} voice cloning failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Voice cloning failed',
          title: 'Cloning failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('cloned')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findClonedVoices(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: VoicesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      const publicMetadata = getPublicMetadata(user);

      const findAllQuery = {
        orderBy: { createdAt: -1 as const },
        where: {
          isCloned: true,
          isDeleted: false,
          organizationId: publicMetadata.organization,
        },
      };

      const data: AggregatePaginateResult<IngredientDocument> =
        await this.voicesService.findAll(findAllQuery, options);
      return serializeCollection(request, VoiceCloneSerializer, data);
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find cloned voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('clone/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteClonedVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    if (!isEntityId(id)) {
      throw new HttpException(
        { detail: 'Invalid voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const voice = await this.voicesService.findOne({
      _id: id,
      isCloned: true,
      isDeleted: false,
      organizationId: publicMetadata.organization,
    });

    if (!voice) {
      return returnNotFound(this.constructorName, id);
    }

    const voiceDoc = voice as unknown as {
      _id: string;
      externalVoiceId?: string;
      voiceProvider?: VoiceProvider;
    };

    try {
      // Delete from provider if external ID exists
      if (
        voiceDoc.externalVoiceId &&
        voiceDoc.voiceProvider === VoiceProvider.ELEVENLABS
      ) {
        const byokKey = await this.byokService.resolveApiKey(
          publicMetadata.organization,
          ByokProvider.ELEVENLABS,
        );
        await this.elevenLabsService.deleteVoice(
          voiceDoc.externalVoiceId,
          byokKey?.apiKey,
        );
      }

      // Soft delete the ingredient
      await this.voicesService.patchAll(
        {
          OR: [{ id: String(voiceDoc._id) }, { mongoId: String(voiceDoc._id) }],
        },
        { isDeleted: true },
      );

      return serializeSingle(request, VoiceCloneSerializer, voice);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to delete cloned voice`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to delete cloned voice',
          title: 'Delete failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseSingleProvider(value?: string): VoiceProvider | undefined {
    if (!value) {
      return undefined;
    }
    const upper = value.trim().toUpperCase() as VoiceProvider;
    const allowed: VoiceProvider[] = [
      VoiceProvider.ELEVENLABS,
      VoiceProvider.HEYGEN,
    ];
    return allowed.includes(upper) ? upper : undefined;
  }

  private parseProviders(
    providers?: string | VoiceProvider[],
  ): VoiceProvider[] {
    const supportedProviders = new Set<VoiceProvider>([
      VoiceProvider.ELEVENLABS,
      VoiceProvider.HEYGEN,
      VoiceProvider.GENFEED_AI,
    ]);

    if (!providers) {
      return [...supportedProviders];
    }

    const rawProviders = Array.isArray(providers)
      ? providers
      : providers.split(',');

    const parsedProviders = rawProviders
      .map((value) => value.trim())
      .filter((value): value is VoiceProvider =>
        supportedProviders.has(value as VoiceProvider),
      );

    return parsedProviders.length > 0
      ? parsedProviders
      : [...supportedProviders];
  }

  private parseCatalogProviders(
    providers?: VoiceProvider[],
  ): Array<VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN> {
    const allowedProviders = new Set([
      VoiceProvider.ELEVENLABS,
      VoiceProvider.HEYGEN,
    ]);

    if (!providers || providers.length === 0) {
      return [VoiceProvider.ELEVENLABS, VoiceProvider.HEYGEN];
    }

    const parsed = providers.filter(
      (provider): provider is VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN =>
        allowedProviders.has(provider),
    );

    return parsed.length > 0
      ? parsed
      : [VoiceProvider.ELEVENLABS, VoiceProvider.HEYGEN];
  }

  private async cloneVoiceElevenLabs(
    request: Request,
    user: User,
    dto: CloneVoiceDto,
    file: Express.Multer.File | undefined,
    publicMetadata: { brand: string; organization: string; user: string },
    url: string,
  ): Promise<JsonApiSingleResponse> {
    const byokKey = await this.byokService.resolveApiKey(
      publicMetadata.organization,
      ByokProvider.ELEVENLABS,
    );

    const files: Buffer[] = file ? [file.buffer] : [];

    const result = await this.elevenLabsService.cloneVoice(
      dto.name,
      files,
      {
        description: dto.description,
        removeBackgroundNoise: dto.removeBackgroundNoise ?? true,
      },
      byokKey?.apiKey,
    );

    this.loggerService.log(`${url} ElevenLabs voice cloned`, {
      name: dto.name,
      voiceId: result.voiceId,
    });

    // Create ingredient record
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      label: dto.name,
      organization: publicMetadata.organization,
      status: IngredientStatus.GENERATED,
    });

    // Update with clone-specific fields
    await this.voicesService.patchAll(
      {
        OR: [
          { id: String(ingredientData._id) },
          { mongoId: String(ingredientData._id) },
        ],
      },
      {
        cloneStatus: VoiceCloneStatus.READY,
        externalVoiceId: result.voiceId,
        isCloned: true,
        isVoiceActive: true,
        isDefaultSelectable: true,
        voiceProvider: VoiceProvider.ELEVENLABS,
        voiceSource: 'cloned',
      },
    );

    const completedVoice = await this.voicesService.findOne(
      { _id: ingredientData._id },
      [PopulatePatterns.metadataFull],
    );

    if (!completedVoice) {
      throw new HttpException(
        { detail: 'Voice not found after cloning', title: 'Clone error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    await this.notificationsPublisherService.publishAssetStatus(
      String(ingredientData._id),
      VoiceCloneStatus.READY,
      publicMetadata.user,
      {
        cloneStatus: VoiceCloneStatus.READY,
        provider: VoiceProvider.ELEVENLABS,
      },
    );

    return serializeSingle(request, VoiceCloneSerializer, completedVoice);
  }

  private async cloneVoiceGenfeedAi(
    request: Request,
    user: User,
    dto: CloneVoiceDto,
    _file: Express.Multer.File | undefined,
    publicMetadata: { brand: string; organization: string; user: string },
    url: string,
  ): Promise<JsonApiSingleResponse> {
    const isAvailable = await this.fleetService.isAvailable('voices');

    if (!isAvailable) {
      throw new HttpException(
        {
          detail:
            'Self-hosted voice service is currently offline. Try ElevenLabs instead.',
          title: 'Service unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!dto.audioUrl) {
      throw new HttpException(
        {
          detail: 'audioUrl is required for Genfeed AI voice cloning',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create ingredient record with PROCESSING status (async clone)
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      label: dto.name,
      organization: publicMetadata.organization,
      status: IngredientStatus.PROCESSING,
    });

    // Update with clone-specific fields
    await this.voicesService.patchAll(
      {
        OR: [
          { id: String(ingredientData._id) },
          { mongoId: String(ingredientData._id) },
        ],
      },
      {
        cloneStatus: VoiceCloneStatus.CLONING,
        isCloned: true,
        isVoiceActive: true,
        isDefaultSelectable: true,
        voiceProvider: VoiceProvider.GENFEED_AI,
        sampleAudioUrl: dto.audioUrl,
        voiceSource: 'cloned',
      },
    );

    await this.notificationsPublisherService.publishAssetStatus(
      String(ingredientData._id),
      VoiceCloneStatus.CLONING,
      publicMetadata.user,
      {
        cloneStatus: VoiceCloneStatus.CLONING,
        progress: 10,
        provider: VoiceProvider.GENFEED_AI,
      },
    );

    const result = await this.fleetService.cloneVoice({
      audioUrl: dto.audioUrl,
      handle: ingredientData._id.toString(),
      label: dto.name,
    });

    if (!result) {
      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(ingredientData._id) },
            { mongoId: String(ingredientData._id) },
          ],
        },
        {
          cloneStatus: VoiceCloneStatus.FAILED,
          status: IngredientStatus.FAILED,
        },
      );

      await this.notificationsPublisherService.publishAssetStatus(
        String(ingredientData._id),
        VoiceCloneStatus.FAILED,
        publicMetadata.user,
        {
          cloneStatus: VoiceCloneStatus.FAILED,
          provider: VoiceProvider.GENFEED_AI,
        },
      );

      throw new HttpException(
        {
          detail:
            'Voice cloning request failed. The service may be unavailable.',
          title: 'Clone failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.loggerService.log(`${url} Genfeed AI voice clone initiated`, {
      jobId: result.jobId,
      name: dto.name,
    });

    const processingVoice = await this.voicesService.findOne(
      { _id: ingredientData._id },
      [PopulatePatterns.metadataFull],
    );

    if (!processingVoice) {
      throw new HttpException(
        {
          detail: 'Voice not found after clone initiation',
          title: 'Clone error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return serializeSingle(request, VoiceCloneSerializer, processingVoice);
  }
}
