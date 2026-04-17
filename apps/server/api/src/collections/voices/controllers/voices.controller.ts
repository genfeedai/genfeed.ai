import { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { ImportVoicesDto } from '@api/collections/voices/dto/import-voices.dto';
import { UpdateVoiceCatalogDto } from '@api/collections/voices/dto/update-voice-catalog.dto';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
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
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import {
  ActivitySource,
  AssetScope,
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
import { VoiceCloneSerializer, VoiceSerializer } from '@genfeedai/serializers';
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

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

interface UploadedAudioFile {
  buffer: Buffer;
}

@AutoSwagger()
@Controller('voices')
export class VoicesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly fleetService: FleetService,
    private readonly heygenService: HeyGenService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly notificationsPublisherService: NotificationsPublisherService,
    private readonly sharedService: SharedService,
    private readonly voicesService: VoicesService,
  ) {}

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
      const isSuperAdmin = getIsSuperAdmin(user, request);
      const publicMetadata = getPublicMetadata(user);
      const brand = publicMetadata.brand;
      const organization = publicMetadata.organization;
      const requestedProviders = this.parseProviders(query.providers);
      const requestedSources = query.voiceSource;
      const normalizedSearch = query.search?.trim();
      const status = QueryDefaultsUtil.parseStatusFilter(query.status);
      const sort = query.sort || 'metadata.label: 1, createdAt: -1';
      const catalogFilter: Record<string, unknown> = {
        voiceSource: 'catalog',
      };
      const match: Record<string, unknown> = {
        category: IngredientCategory.VOICE,
        isDeleted: QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted),
        status,
      };

      if (query.scope) {
        catalogFilter.scope = query.scope;
      }

      if (!isSuperAdmin) {
        match.$or = [
          catalogFilter,
          {
            $or: [
              { isCloned: true },
              { voiceSource: { $exists: false } },
              { voiceSource: { $in: ['cloned', 'generated'] } },
            ],
            brand,
            organization,
          },
        ];
      }

      if (query.isDefault !== undefined) {
        match.isDefault = Boolean(query.isDefault);
      }

      if (query.isActive !== undefined) {
        match.isActive = query.isActive ? { $ne: false } : false;
      }

      if (requestedProviders.length > 0) {
        match.provider = { $in: requestedProviders };
      }

      if (requestedSources && requestedSources.length > 0) {
        match.voiceSource = { $in: requestedSources };
      }

      const aggregate: Record<string, unknown>[] = [
        {
          $match: match,
        },
        {
          $lookup: {
            as: 'metadata',
            foreignField: '_id',
            from: 'metadata',
            localField: 'metadata',
          },
        },
        {
          $unwind: {
            path: '$metadata',
            preserveNullAndEmptyArrays: true,
          },
        },
      ];

      if (normalizedSearch) {
        aggregate.push({
          $match: {
            $or: [
              {
                'metadata.label': {
                  $options: 'i',
                  $regex: normalizedSearch,
                },
              },
              {
                externalVoiceId: {
                  $options: 'i',
                  $regex: normalizedSearch,
                },
              },
              {
                provider: {
                  $options: 'i',
                  $regex: normalizedSearch,
                },
              },
            ],
          },
        });
      }

      aggregate.push(
        {
          $addFields: {
            isActive: { $ifNull: ['$isActive', true] },
            isDefaultSelectable: { $ifNull: ['$isDefaultSelectable', true] },
            voiceSource: {
              $ifNull: [
                '$voiceSource',
                {
                  $cond: [{ $eq: ['$isCloned', true] }, 'cloned', 'generated'],
                },
              ],
            },
          },
        },
        {
          $sort: handleQuerySort(sort),
        },
      );

      const data: AggregatePaginateResult<IngredientDocument> =
        await this.voicesService.findAll(aggregate, options);
      return serializeCollection(request, VoiceSerializer, data);
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('import')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async importCatalogVoices(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ImportVoicesDto,
  ): Promise<JsonApiCollectionResponse> {
    if (!getIsSuperAdmin(user, request)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const providers = this.parseCatalogProviders(dto.providers);
    const publicMetadata = getPublicMetadata(user);

    for (const provider of providers) {
      if (provider === VoiceProvider.ELEVENLABS) {
        const voices = await this.elevenLabsService.getVoices();
        for (const voice of voices) {
          await this.upsertCatalogVoice(user, publicMetadata, {
            externalVoiceId: voice.voiceId,
            label: voice.name,
            provider,
            providerData: {},
            sampleAudioUrl: voice.preview ?? null,
          });
        }
      }

      if (provider === VoiceProvider.HEYGEN) {
        const voices = await this.heygenService.getVoices();
        for (const voice of voices) {
          await this.upsertCatalogVoice(user, publicMetadata, {
            externalVoiceId: voice.voiceId,
            label: voice.name,
            provider,
            providerData: {
              index: voice.index,
            },
            sampleAudioUrl: voice.preview || null,
          });
        }
      }
    }

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted: false,
          type: 'voice',
          voiceSource: 'catalog',
        },
      },
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'metadata',
        },
      },
      {
        $unwind: {
          path: '$metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          createdAt: -1,
          'metadata.label': 1,
          provider: 1,
        },
      },
    ];

    const data = await this.voicesService.findAll(aggregate, {
      customLabels,
      limit: 500,
      page: 1,
      pagination: false,
    });

    return serializeCollection(request, VoiceSerializer, data);
  }

  @Patch(':id')
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

    if (!isValidObjectId(id)) {
      throw new HttpException(
        { detail: 'Invalid voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const voice = await this.voicesService.findOne({
      _id: id,
      isDeleted: false,
      type: 'voice',
      voiceSource: 'catalog',
    });

    if (!voice) {
      return returnNotFound(this.constructorName, id);
    }

    const updates: Record<string, unknown> = {};

    if (dto.isActive !== undefined) {
      updates.isActive = dto.isActive;
    }

    if (dto.isDefaultSelectable !== undefined) {
      updates.isDefaultSelectable = dto.isDefaultSelectable;
    }

    if (dto.isFeatured !== undefined) {
      updates.isFeatured = dto.isFeatured;
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpException(
        {
          detail: 'At least one catalog voice field must be provided',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.voicesService.patchAll({ _id: id }, { $set: updates });

    const updatedVoice = await this.voicesService.findOne({ _id: id }, [
      PopulatePatterns.metadataFull,
    ]);

    if (!updatedVoice) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, VoiceSerializer, updatedVoice);
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
        { _id: ingredientData._id },
        {
          $set: {
            duration: result.duration,
            status: IngredientStatus.GENERATED,
            url: result.audioUrl,
          },
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
        { _id: ingredientData._id },
        { $set: { status: IngredientStatus.FAILED } },
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

  private async upsertCatalogVoice(
    user: User,
    publicMetadata: { brand: string; organization: string; user: string },
    input: {
      externalVoiceId: string;
      label: string;
      provider: VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN;
      providerData: Record<string, unknown>;
      sampleAudioUrl: string | null;
    },
  ): Promise<void> {
    const existingVoice = (await this.voicesService.findOne(
      {
        externalVoiceId: input.externalVoiceId,
        isDeleted: false,
        provider: input.provider,
        type: 'voice',
        voiceSource: 'catalog',
      },
      [PopulatePatterns.metadataFull],
    )) as
      | (IngredientDocument & {
          _id: string;
          metadata?: { _id?: string | string } | string;
        })
      | null;

    const catalogPatch = {
      externalVoiceId: input.externalVoiceId,
      isCloned: false,
      provider: input.provider,
      providerData: input.providerData,
      sampleAudioUrl: input.sampleAudioUrl ?? undefined,
      scope: AssetScope.ORGANIZATION,
      voiceSource: 'catalog' as const,
    };

    if (existingVoice?._id) {
      await this.voicesService.patchAll(
        { _id: existingVoice._id },
        { $set: catalogPatch },
      );

      const metadataId =
        existingVoice.metadata &&
        typeof existingVoice.metadata === 'object' &&
        '_id' in existingVoice.metadata
          ? existingVoice.metadata._id
          : existingVoice.metadata;

      if (metadataId && isValidObjectId(String(metadataId))) {
        await this.metadataService.patch(String(metadataId), {
          externalId: input.externalVoiceId,
          externalProvider: input.provider,
          label: input.label,
        });
      }

      return;
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: publicMetadata.brand,
        category: IngredientCategory.VOICE,
        extension: MetadataExtension.MP3,
        label: input.label,
        organization: publicMetadata.organization,
        scope: AssetScope.ORGANIZATION,
        status: IngredientStatus.UPLOADED,
      });

    await this.metadataService.patch(String(metadataData._id), {
      externalId: input.externalVoiceId,
      externalProvider: input.provider,
      label: input.label,
    });

    await this.voicesService.patchAll(
      { _id: ingredientData._id },
      {
        $set: {
          ...catalogPatch,
          isActive: true,
          isDefaultSelectable: true,
          isFeatured: false,
          status: IngredientStatus.UPLOADED,
        },
      },
    );
  }

  async updateVoice(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { params: { id } });

    const voice = (await this.voicesService.findOne(
      {
        _id: id,
        type: 'voice',
      },
      [PopulatePatterns.metadataFull],
    )) as unknown as {
      _id: string;
      metadata: { externalId: string };
    };

    if (!voice) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, VoiceSerializer, voice);
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
    @UploadedFile() file?: UploadedAudioFile,
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

      const aggregate: Record<string, unknown>[] = [
        {
          $match: {
            isCloned: true,
            isDeleted: false,
            organization: publicMetadata.organization,
            type: 'voice',
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ];

      const data: AggregatePaginateResult<IngredientDocument> =
        await this.voicesService.findAll(aggregate, options);
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

    if (!isValidObjectId(id)) {
      throw new HttpException(
        { detail: 'Invalid voice ID', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const voice = await this.voicesService.findOne({
      _id: id,
      isCloned: true,
      isDeleted: false,
      organization: publicMetadata.organization,
      type: 'voice',
    });

    if (!voice) {
      return returnNotFound(this.constructorName, id);
    }

    const voiceDoc = voice as unknown as {
      _id: string;
      externalVoiceId?: string;
      provider?: VoiceProvider;
    };

    try {
      // Delete from provider if external ID exists
      if (
        voiceDoc.externalVoiceId &&
        voiceDoc.provider === VoiceProvider.ELEVENLABS
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
        { _id: voiceDoc._id },
        { $set: { isDeleted: true } },
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

  private async cloneVoiceElevenLabs(
    request: Request,
    user: User,
    dto: CloneVoiceDto,
    file: UploadedAudioFile | undefined,
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
      { _id: ingredientData._id },
      {
        $set: {
          cloneStatus: VoiceCloneStatus.READY,
          externalVoiceId: result.voiceId,
          isActive: true,
          isCloned: true,
          isDefaultSelectable: true,
          provider: VoiceProvider.ELEVENLABS,
          voiceSource: 'cloned',
        },
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
    _file: UploadedAudioFile | undefined,
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
      { _id: ingredientData._id },
      {
        $set: {
          cloneStatus: VoiceCloneStatus.CLONING,
          isActive: true,
          isCloned: true,
          isDefaultSelectable: true,
          provider: VoiceProvider.GENFEED_AI,
          sampleAudioUrl: dto.audioUrl,
          voiceSource: 'cloned',
        },
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
        { _id: ingredientData._id },
        {
          $set: {
            cloneStatus: VoiceCloneStatus.FAILED,
            status: IngredientStatus.FAILED,
          },
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
