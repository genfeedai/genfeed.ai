import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { ImportVoicesDto } from '@api/collections/voices/dto/import-voices.dto';
import { UpdateVoiceCatalogDto } from '@api/collections/voices/dto/update-voice-catalog.dto';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
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
import {
  VoiceProvider as DbVoiceProvider,
  type ExternalVoice,
} from '@genfeedai/prisma';
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
  id: string;
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

/**
 * Catalog rows live in the ExternalVoice table, whose `externalProvider` column
 * is the Prisma `VoiceProvider` (UPPERCASE member values). The rest of the app —
 * wire format, DTOs, Ingredient records, frontend labels — uses the
 * `@genfeedai/enums` `VoiceProvider` (lowercase values). These exhaustive maps
 * bridge the two domains so neither casing leaks across the boundary.
 */
const APP_TO_DB_PROVIDER: Record<VoiceProvider, DbVoiceProvider> = {
  [VoiceProvider.ELEVENLABS]: DbVoiceProvider.ELEVENLABS,
  [VoiceProvider.GENFEED_AI]: DbVoiceProvider.GENFEED_AI,
  [VoiceProvider.HEDRA]: DbVoiceProvider.HEDRA,
  [VoiceProvider.HEYGEN]: DbVoiceProvider.HEYGEN,
};

const DB_TO_APP_PROVIDER: Record<DbVoiceProvider, VoiceProvider> = {
  [DbVoiceProvider.ELEVENLABS]: VoiceProvider.ELEVENLABS,
  [DbVoiceProvider.GENFEED_AI]: VoiceProvider.GENFEED_AI,
  [DbVoiceProvider.HEDRA]: VoiceProvider.HEDRA,
  [DbVoiceProvider.HEYGEN]: VoiceProvider.HEYGEN,
};

/** Providers whose remote catalog we can sync into ExternalVoice. */
type SyncableDbProvider =
  | typeof DbVoiceProvider.ELEVENLABS
  | typeof DbVoiceProvider.HEYGEN;

function toWireFormat(voice: ExternalVoice): VoiceCatalogEntryDocument {
  return {
    id: voice.id,
    createdAt: voice.createdAt,
    externalVoiceId: voice.externalId,
    isActive: voice.isActive,
    isDefaultSelectable: voice.isDefaultSelectable,
    isFeatured: voice.isFeatured,
    language: voice.language,
    name: voice.name,
    providerData: voice.providerData,
    provider: DB_TO_APP_PROVIDER[voice.externalProvider],
    sampleAudioUrl: voice.sampleAudioUrl,
    updatedAt: voice.updatedAt,
  };
}

/**
 * Voice TTS credit cost per output minute. Canonical source of truth:
 * `INTERNAL_CREDIT_COSTS.voicePerMinute` in `@genfeedai/pricing` (17 credits =
 * $0.17, ~70% margin on ~$0.05 provider cost). Mirrored here as a backend-local
 * constant because `@genfeedai/pricing` is a shared/frontend package the API
 * runtime does not depend on — keep this value in sync with the canonical one.
 */
const VOICE_CREDITS_PER_MINUTE = 17;

/**
 * Flat credit charge for a one-time voice clone (ElevenLabs synchronous, or
 * Genfeed Fleet asynchronous). Fleet clones are billed at job acceptance today;
 * true compute-time metering (Replicate/Fal-style, on job completion) is tracked
 * as a follow-up — see #1354.
 */
const VOICE_CLONE_CREDITS = 17;

@AutoSwagger()
@Controller('voices')
export class VoicesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly creditsUtilsService: CreditsUtilsService,
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
  // TTS cost is duration-based (VOICE_CREDITS_PER_MINUTE per output minute) and
  // the rendered audio length is unknown until generation completes, so the
  // charge is deferred: CreditsGuard skips the up-front amount/balance check
  // (previously this route had no amount/modelKey and fell through to
  // `throw InsufficientCreditsException(0,0)` on every call — #1354), the
  // handler settles the exact amount from result.duration, and CreditsInterceptor
  // deducts it on the successful response.
  @Credits({
    description: 'Voice generation (TTS)',
    source: ActivitySource.VOICE_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
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

    // Up-front floor gate: since the exact charge is deferred until after
    // render, block organizations that cannot afford even the 1-credit minimum
    // before we spend a provider (ElevenLabs) call. The exact duration-based
    // amount is settled post-render below.
    await this.assertOrganizationCanAfford(publicMetadata.organization, 1);

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
        ingredientData.id.toString(),
        publicMetadata.organization,
        publicMetadata.user,
      );

      // Update ingredient to GENERATED with audio URL and duration
      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(ingredientData.id) },
            { mongoId: String(ingredientData.id) },
          ],
        },
        {
          duration: result.duration,
          status: IngredientStatus.GENERATED,
          url: result.audioUrl,
        },
      );

      // Settle the deferred credit charge from the actual rendered duration.
      // Throws InsufficientCreditsException (surfaced by the catch below) if the
      // org cannot afford the settled amount; otherwise CreditsInterceptor
      // deducts it on the successful response.
      await this.settleVoiceGenerationCredits(
        request,
        publicMetadata.organization,
        result.duration,
      );

      // Fetch the updated ingredient with population
      const completedIngredient = await this.voicesService.findOne(
        { _id: ingredientData.id },
        [PopulatePatterns.metadataFull],
      );

      if (!completedIngredient) {
        throw new HttpException(
          {
            detail: `Ingredient ${ingredientData.id} not found after generation`,
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
            { id: String(ingredientData.id) },
            { mongoId: String(ingredientData.id) },
          ],
        },
        { status: IngredientStatus.FAILED },
      );

      // Preserve typed HTTP errors (e.g. InsufficientCreditsException from the
      // credit settlement above) instead of masking them as a generic 500.
      if (error instanceof HttpException) {
        throw error;
      }

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
  // Flat per-clone charge. Cloning creates a one-time reusable voice (not
  // duration-priced output), so a fixed `amount` is checked up-front by
  // CreditsGuard and deducted by CreditsInterceptor on success — replacing the
  // previous amount-less config that fell through to
  // `throw InsufficientCreditsException(0,0)` on every call (#1354). Fleet
  // (async) clones are billed here at acceptance; compute-time metering on job
  // completion is a follow-up (see #1354).
  @Credits({
    amount: VOICE_CLONE_CREDITS,
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
      id: string;
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
          OR: [{ id: String(voiceDoc.id) }, { mongoId: String(voiceDoc.id) }],
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

  /**
   * Assert the organization can afford `credits`, throwing a typed
   * InsufficientCreditsException (422) carrying the current balance otherwise.
   */
  private async assertOrganizationCanAfford(
    organizationId: string,
    credits: number,
  ): Promise<void> {
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        credits,
      );

    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(credits, balance);
    }
  }

  /**
   * Resolve the deferred voice-generation charge from the rendered audio
   * duration (VOICE_CREDITS_PER_MINUTE per minute, minimum 1 credit) and write
   * it onto `request.creditsConfig` so CreditsInterceptor deducts it on the
   * successful response. Throws InsufficientCreditsException if the organization
   * cannot afford the settled amount (blocking both the deduction and the
   * response). Mirrors the deferred-credit finalization used by video
   * generation (`VideoGenerationService.ensureDeferredCredits`).
   */
  private async settleVoiceGenerationCredits(
    request: Request,
    organizationId: string,
    durationSeconds: number,
  ): Promise<void> {
    const seconds = Number(durationSeconds) || 0;
    const credits = Math.max(
      1,
      Math.ceil((seconds / 60) * VOICE_CREDITS_PER_MINUTE),
    );

    await this.assertOrganizationCanAfford(organizationId, credits);

    const requestWithCredits = request as unknown as {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        [key: string]: unknown;
      };
    };

    if (requestWithCredits.creditsConfig) {
      requestWithCredits.creditsConfig = {
        ...requestWithCredits.creditsConfig,
        amount: credits,
        deferred: false,
      };
    }
  }

  private parseSingleProvider(value?: string): SyncableDbProvider | undefined {
    if (!value) {
      return undefined;
    }
    // Query param arrives in app (lowercase) casing; the catalog column is the
    // Prisma enum (UPPERCASE), so normalize to UPPERCASE before matching.
    const normalized = value.trim().toUpperCase();
    const allowed: SyncableDbProvider[] = [
      DbVoiceProvider.ELEVENLABS,
      DbVoiceProvider.HEYGEN,
    ];
    return allowed.find((provider) => provider === normalized);
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
  ): SyncableDbProvider[] {
    const fallback: SyncableDbProvider[] = [
      DbVoiceProvider.ELEVENLABS,
      DbVoiceProvider.HEYGEN,
    ];

    if (!providers || providers.length === 0) {
      return fallback;
    }

    const catalogProviders = new Set<DbVoiceProvider>([
      DbVoiceProvider.ELEVENLABS,
      DbVoiceProvider.HEYGEN,
    ]);

    // App-domain providers (lowercase) → Prisma catalog providers (UPPERCASE),
    // dropping any that aren't syncable catalog sources (e.g. GENFEED_AI).
    const parsed = providers
      .map((provider) => APP_TO_DB_PROVIDER[provider])
      .filter((provider): provider is SyncableDbProvider =>
        catalogProviders.has(provider),
      );

    return parsed.length > 0 ? parsed : fallback;
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
          { id: String(ingredientData.id) },
          { mongoId: String(ingredientData.id) },
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
      { _id: ingredientData.id },
      [PopulatePatterns.metadataFull],
    );

    if (!completedVoice) {
      throw new HttpException(
        { detail: 'Voice not found after cloning', title: 'Clone error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    await this.notificationsPublisherService.publishAssetStatus(
      String(ingredientData.id),
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
          { id: String(ingredientData.id) },
          { mongoId: String(ingredientData.id) },
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
      String(ingredientData.id),
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
      handle: ingredientData.id.toString(),
      label: dto.name,
    });

    if (!result) {
      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(ingredientData.id) },
            { mongoId: String(ingredientData.id) },
          ],
        },
        {
          cloneStatus: VoiceCloneStatus.FAILED,
          status: IngredientStatus.FAILED,
        },
      );

      await this.notificationsPublisherService.publishAssetStatus(
        String(ingredientData.id),
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
      { _id: ingredientData.id },
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
