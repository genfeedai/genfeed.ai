import { DarkroomService } from '@api/endpoints/admin/darkroom/darkroom.service';
import {
  BulkEc2ActionDto,
  CloudFrontInvalidateDto,
  CreateCharacterDto,
  DarkroomGenerateVoiceDto,
  Ec2ActionDto,
  GenerateImageDto,
  GenerateLipSyncDto,
  PublishAssetDto,
  QueryAssetsDto,
  ReviewAssetDto,
  StartTrainingDto,
  UpdateCharacterDto,
  UploadDatasetDto,
} from '@api/endpoints/admin/darkroom/dto';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import type { User } from '@clerk/backend';
import {
  DarkroomCloudFrontInvalidationSerializer,
  DarkroomEc2ActionResultSerializer,
  DarkroomEc2BulkActionResultSerializer,
  DarkroomEc2InstanceSerializer,
  DarkroomFleetHealthSerializer,
  DarkroomGenerateVoiceResultSerializer,
  DarkroomGenerationJobSerializer,
  DarkroomLipSyncJobSerializer,
  DarkroomLipSyncStatusSerializer,
  DarkroomqueryCampaignSerializer,
  DarkroomqueryStatsSerializer,
  DarkroomServiceStatusSerializer,
  DarkroomUploadDatasetResultSerializer,
  DarkroomVoiceSerializer,
  IngredientSerializer,
  PersonaSerializer,
  TrainingSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Darkroom')
@Controller('admin/darkroom')
@UseGuards(IpWhitelistGuard)
export class DarkroomController {
  constructor(
    private readonly darkroomService: DarkroomService,
    private readonly fleetService: FleetService,
    private readonly loggerService: LoggerService,
  ) {}

  // === Characters ===

  @Get('characters')
  @ApiOperation({ summary: 'List all darkroom characters' })
  async listCharacters(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const characters = await this.darkroomService.getCharacters(organization);
      return serializeCollection(request, PersonaSerializer, {
        docs: characters,
        hasNextPage: false,
        hasPrevPage: false,
        limit: characters.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: characters.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listCharacters');
    }
  }

  @Get('characters/:slug')
  @ApiOperation({ summary: 'Get character by slug' })
  async getCharacter(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const character = await this.darkroomService.getCharacterBySlug(
        slug,
        organization,
      );
      return serializeSingle(request, PersonaSerializer, character);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getCharacter');
    }
  }

  @Post('characters')
  @ApiOperation({ summary: 'Create a new darkroom character' })
  async createCharacter(
    @Req() request: Request,
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const userId = ObjectIdUtil.toObjectId(dbUserId)!;
      const organizationId = ObjectIdUtil.toObjectId(organization)!;
      const brandId = ObjectIdUtil.toObjectId(brand)!;

      const character = await this.darkroomService.createCharacter({
        ...dto,
        brand: brandId,
        organization: organizationId,
        user: userId,
      } as Parameters<DarkroomService['createCharacter']>[0]);
      return serializeSingle(request, PersonaSerializer, character);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createCharacter');
    }
  }

  @Patch('characters/:slug')
  @ApiOperation({ summary: 'Update a darkroom character' })
  async updateCharacter(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const character = await this.darkroomService.getCharacterBySlug(
        slug,
        organization,
      );
      const updated = await this.darkroomService.updateCharacter(
        character._id.toString(),
        dto as Record<string, unknown>,
      );
      return serializeSingle(request, PersonaSerializer, updated);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'updateCharacter');
    }
  }

  @Delete('characters/:slug')
  @ApiOperation({ summary: 'Soft-delete a darkroom character' })
  async deleteCharacter(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const character = await this.darkroomService.getCharacterBySlug(
        slug,
        organization,
      );
      const deleted = await this.darkroomService.updateCharacter(
        character._id.toString(),
        {
          isDeleted: true,
        } as Record<string, unknown>,
      );
      return serializeSingle(request, PersonaSerializer, deleted);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteCharacter');
    }
  }

  @Post('characters/:slug/dataset')
  @UseInterceptors(FileFieldsInterceptor([{ maxCount: 200, name: 'images' }]))
  @ApiOperation({
    summary: 'Upload a training dataset and sync it to the GPU images service',
  })
  async uploadDataset(
    @Req() request: Request,
    @Param('slug') slug: string,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
    @Body() dto: UploadDatasetDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.darkroomService.uploadDataset(
        organization,
        slug,
        (files.images ?? []).map((file) => ({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
        })),
        dto.captions,
      );
      return serializeSingle(request, DarkroomUploadDatasetResultSerializer, {
        _id: `dataset:${slug}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'uploadDataset');
    }
  }

  @Post('characters/:slug/training-data')
  @ApiOperation({
    summary: 'Generate persona training data from enabled darkroom sources',
  })
  async generateCharacterTrainingData(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const data = await this.darkroomService.ingestTrainingDataForCharacter(
        organization,
        dbUserId,
        slug,
      );

      return serializeSingle(request, DarkroomUploadDatasetResultSerializer, {
        _id: `training-data:${slug}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'generateCharacterTrainingData',
      );
    }
  }

  @Post('training-data')
  @ApiOperation({
    summary:
      'Generate training data for all enabled darkroom personas in enabled brands',
  })
  async generateAllTrainingData(
    @Req() request: Request,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const data =
        await this.darkroomService.ingestTrainingDataForAllEnabledCharacters(
          organization,
          dbUserId,
        );

      return serializeSingle(request, DarkroomUploadDatasetResultSerializer, {
        _id: `training-data:${organization}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'generateAllTrainingData',
      );
    }
  }

  // === Assets ===

  @Get('assets')
  @ApiOperation({ summary: 'List darkroom assets with filters' })
  async listAssets(
    @Req() request: Request,
    @Query() query: QueryAssetsDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const assets = await this.darkroomService.getAssets(organization, query);
      return serializeCollection(request, IngredientSerializer, {
        docs: assets,
        hasNextPage: false,
        hasPrevPage: false,
        limit: assets.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: assets.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listAssets');
    }
  }

  @Patch('assets/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review an asset (approve/reject)' })
  async reviewAsset(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: ReviewAssetDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const asset = await this.darkroomService.reviewAsset(
        id,
        organization,
        dto.reviewStatus,
      );
      return serializeSingle(request, IngredientSerializer, asset);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'reviewAsset');
    }
  }

  @Post('assets/:id/publish')
  @ApiOperation({ summary: 'Publish an approved asset to platforms' })
  async publishAsset(
    @Param('id') id: string,
    @Body() dto: PublishAssetDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand } = getPublicMetadata(user);
      return this.darkroomService.publishAsset(
        id,
        organization,
        brand,
        dto.platforms,
        dto.caption,
      );
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'publishAsset');
    }
  }

  // === Generation ===

  @Post('generate')
  @ApiOperation({ summary: 'Generate an image for a character' })
  async generateImage(
    @Req() request: Request,
    @Body() dto: GenerateImageDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const userId = dbUserId;

      // Parse aspect ratio to width/height if provided
      let width: number | undefined;
      let height: number | undefined;
      if (dto.aspectRatio) {
        const [w, h] = dto.aspectRatio.split(':').map(Number);
        if (w && h) {
          // Default to 1024px base and scale proportionally
          const scale = 1024 / Math.max(w, h);
          width = Math.round(w * scale);
          height = Math.round(h * scale);
        }
      }

      const ingredient = await this.darkroomService.generateImage(
        organization,
        brand,
        userId,
        dto.personaSlug,
        dto.prompt,
        {
          cfgScale: dto.cfgScale,
          height,
          lora: dto.lora,
          model: dto.model,
          negativePrompt: dto.negativePrompt,
          seed: dto.seed,
          steps: dto.steps,
          width,
        },
      );

      return serializeSingle(request, IngredientSerializer, ingredient);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateImage');
    }
  }

  @Post('generate/jobs')
  @ApiOperation({ summary: 'Queue an image generation job for a character' })
  async createGenerateJob(
    @Req() request: Request,
    @Body() dto: GenerateImageDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const data = await this.darkroomService.createGenerationJob(
        organization,
        brand,
        dbUserId,
        dto,
      );
      return serializeSingle(request, DarkroomGenerationJobSerializer, {
        _id: data.jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createGenerateJob',
      );
    }
  }

  @Get('generate/jobs/:jobId')
  @ApiOperation({ summary: 'Get image generation job status' })
  async getGenerateJob(
    @Req() request: Request,
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.darkroomService.getGenerationJob(
        jobId,
        organization,
      );
      return serializeSingle(request, DarkroomGenerationJobSerializer, {
        _id: data.jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getGenerateJob');
    }
  }

  // === Lip Sync ===

  @Post('lip-sync')
  @ApiOperation({ summary: 'Generate lip sync video for a character' })
  async generateLipSync(
    @Req() request: Request,
    @Body() dto: GenerateLipSyncDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.darkroomService.generateLipSync(
        organization,
        dto,
      );
      return serializeSingle(request, DarkroomLipSyncJobSerializer, {
        _id: data.jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateLipSync');
    }
  }

  @Get('lip-sync/:jobId')
  @ApiOperation({ summary: 'Get lip sync job status' })
  async getLipSyncStatus(
    @Req() request: Request,
    @Param('jobId') jobId: string,
  ) {
    try {
      const data = await this.darkroomService.getLipSyncStatus(jobId);
      return serializeSingle(request, DarkroomLipSyncStatusSerializer, {
        _id: jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getLipSyncStatus',
      );
    }
  }

  // === Voices / TTS ===

  @Get('voices')
  @ApiOperation({ summary: 'List available TTS voices' })
  async listVoices(@Req() request: Request) {
    try {
      const data = await this.darkroomService.getVoices();
      return serializeCollection(request, DarkroomVoiceSerializer, {
        docs: data.map((voice: { voiceId: string }) => ({
          _id: voice.voiceId,
          ...voice,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listVoices');
    }
  }

  @Post('voices/generate')
  @ApiOperation({ summary: 'Generate TTS audio' })
  async generateVoice(
    @Req() request: Request,
    @Body() dto: DarkroomGenerateVoiceDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.darkroomService.generateVoice(organization, dto);
      return serializeSingle(request, DarkroomGenerateVoiceResultSerializer, {
        _id: `voice:${Date.now()}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateVoice');
    }
  }

  // === Training ===

  @Get('trainings')
  @ApiOperation({ summary: 'List trainings (optionally filtered by persona)' })
  async listTrainings(
    @Req() request: Request,
    @Query('personaSlug') personaSlug: string | undefined,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const trainings = await this.darkroomService.getTrainings(
        organization,
        personaSlug,
      );
      return serializeCollection(request, TrainingSerializer, {
        docs: trainings,
        hasNextPage: false,
        hasPrevPage: false,
        limit: trainings.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: trainings.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listTrainings');
    }
  }

  @Get('trainings/:id')
  @ApiOperation({ summary: 'Get training details' })
  async getTraining(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const training = await this.darkroomService.getTraining(id, organization);
      return serializeSingle(request, TrainingSerializer, training);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getTraining');
    }
  }

  @Post('trainings')
  @ApiOperation({ summary: 'Start LoRA training for a character' })
  async startTraining(
    @Req() request: Request,
    @Body() dto: StartTrainingDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const training = await this.darkroomService.startTraining(
        organization,
        dbUserId,
        brand,
        dto,
      );
      return serializeSingle(request, TrainingSerializer, training);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'startTraining');
    }
  }

  // === query ===

  @Get('pipeline/campaigns')
  @ApiOperation({ summary: 'List campaigns with stats' })
  async listCampaigns(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const campaigns = await this.darkroomService.listCampaigns(organization);
      const data = campaigns.map((campaign: (typeof campaigns)[number]) => ({
        _id: campaign.campaign,
        assetsCount: campaign.assetCount,
        createdAt: campaign.createdAt,
        id: campaign.campaign,
        name: campaign.campaign,
        status: campaign.status,
      }));
      return serializeCollection(request, DarkroomqueryCampaignSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listCampaigns');
    }
  }

  @Get('pipeline/stats')
  @ApiOperation({ summary: 'Get pipeline statistics' })
  async getqueryStats(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const stats = await this.darkroomService.getqueryStats(organization);
      const data = {
        _id: `pipeline-stats:${organization}`,
        assetsGenerated: stats.assets.total,
        assetsPendingReview: stats.assets.byReviewStatus.pending ?? 0,
        assetsPublished: stats.assets.byReviewStatus.approved ?? 0,
        trainingsActive: Object.entries(stats.trainings.byStage)
          .filter(([stage]) => !['completed', 'failed'].includes(stage))
          .reduce((sum, [, count]) => sum + Number(count), 0),
      };
      return serializeSingle(request, DarkroomqueryStatsSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getqueryStats');
    }
  }

  // === Infrastructure ===

  @Get('infrastructure/gpu')
  @ApiOperation({ summary: 'Get GPU instance status' })
  async getGpuStatus(@Req() request: Request) {
    try {
      const data = await this.darkroomService.getServiceHealth();
      return serializeCollection(request, DarkroomServiceStatusSerializer, {
        docs: data.map((service: (typeof data)[number]) => ({
          _id: service.name,
          ...service,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getGpuStatus');
    }
  }

  @Get('infrastructure/ec2/status')
  @ApiOperation({ summary: 'List EC2 instances with status' })
  async getEC2Status(@Req() request: Request) {
    try {
      const data = await this.darkroomService.getEC2Status();
      return serializeCollection(request, DarkroomEc2InstanceSerializer, {
        docs: data.map((instance: (typeof data)[number]) => ({
          _id: instance.instanceId,
          ...instance,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getEC2Status');
    }
  }

  @Post('infrastructure/ec2/action')
  @ApiOperation({ summary: 'Start or stop an EC2 instance' })
  async ec2Action(@Req() request: Request, @Body() dto: Ec2ActionDto) {
    try {
      const data = await this.darkroomService.ec2Action(
        dto.instanceId,
        dto.action,
      );
      return serializeSingle(request, DarkroomEc2ActionResultSerializer, {
        _id: `${dto.action}:${dto.instanceId}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'ec2Action');
    }
  }

  @Post('infrastructure/ec2/action-all')
  @ApiOperation({ summary: 'Start or stop all matching EC2 instances' })
  async ec2ActionAll(@Req() request: Request, @Body() dto: BulkEc2ActionDto) {
    try {
      const data = await this.darkroomService.ec2ActionAll(
        dto.action,
        dto.role,
      );
      return serializeSingle(request, DarkroomEc2BulkActionResultSerializer, {
        _id: `ec2-action-all:${dto.action}:${dto.role ?? 'all'}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'ec2ActionAll');
    }
  }

  @Post('infrastructure/cloudfront/invalidate')
  @ApiOperation({ summary: 'Invalidate CloudFront cache' })
  async invalidateCloudFront(
    @Req() request: Request,
    @Body() dto: CloudFrontInvalidateDto,
  ) {
    try {
      const data = await this.darkroomService.invalidateCloudFront(
        dto.distributionId ||
          this.darkroomService.getDefaultCloudFrontDistributionId(),
        dto.paths,
      );
      return serializeSingle(
        request,
        DarkroomCloudFrontInvalidationSerializer,
        {
          _id: data.invalidationId,
          ...data,
        },
      );
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'invalidateCloudFront',
      );
    }
  }

  @Get('infrastructure/services')
  @ApiOperation({ summary: 'Check ComfyUI and Ollama health' })
  async getServiceHealth(@Req() request: Request) {
    try {
      const data = await this.darkroomService.getServiceHealth();
      return serializeCollection(request, DarkroomServiceStatusSerializer, {
        docs: data.map((service: (typeof data)[number]) => ({
          _id: service.name,
          ...service,
        })),
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getServiceHealth',
      );
    }
  }

  @Get('infrastructure/fleet/health')
  @ApiOperation({ summary: 'Get detailed GPU fleet health' })
  async getFleetHealth(@Req() request: Request) {
    try {
      const data = await this.fleetService.getFleetHealth();
      return serializeSingle(request, DarkroomFleetHealthSerializer, {
        _id: `fleet-health:${data.timestamp}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getFleetHealth');
    }
  }
}
