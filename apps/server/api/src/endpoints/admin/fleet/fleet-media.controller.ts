import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import {
  AdminFleetGenerateVoiceDto,
  GenerateImageDto,
  GenerateLipSyncDto,
  PublishAssetDto,
  QueryAssetsDto,
  ReviewAssetDto,
  StartTrainingDto,
} from '@api/endpoints/admin/fleet/dto';
import { AdminFleetService } from '@api/endpoints/admin/fleet/fleet.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  FleetGenerateVoiceResultSerializer,
  FleetGenerationJobSerializer,
  FleetLipSyncJobSerializer,
  FleetLipSyncStatusSerializer,
  FleetVoiceSerializer,
  IngredientSerializer,
  TrainingSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Fleet')
@Controller(['admin/fleet', 'admin/darkroom'])
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
class AdminFleetController {
  constructor(
    private readonly adminFleetService: AdminFleetService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('assets')
  @ApiOperation({
    summary: 'List fleet assets with filters',
  })
  async listAssets(
    @Req() request: Request,
    @Query() query: QueryAssetsDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const assets = await this.adminFleetService.getAssets(
        organization,
        query,
      );
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
  @ApiOperation({
    summary: 'Review an asset (approve/reject)',
  })
  async reviewAsset(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: ReviewAssetDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const asset = await this.adminFleetService.reviewAsset(
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
  @ApiOperation({
    summary: 'Publish an approved asset to platforms',
  })
  async publishAsset(
    @Param('id') id: string,
    @Body() dto: PublishAssetDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand } = getPublicMetadata(user);
      return this.adminFleetService.publishAsset(
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

  @Post('generate')
  @ApiOperation({
    summary: 'Generate an image for a character',
  })
  async generateImage(
    @Req() request: Request,
    @Body() dto: GenerateImageDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      let width: number | undefined;
      let height: number | undefined;

      if (dto.aspectRatio) {
        const [ratioWidth, ratioHeight] = dto.aspectRatio
          .split(':')
          .map(Number);
        if (ratioWidth && ratioHeight) {
          const scale = 1024 / Math.max(ratioWidth, ratioHeight);
          width = Math.round(ratioWidth * scale);
          height = Math.round(ratioHeight * scale);
        }
      }

      const ingredient = await this.adminFleetService.generateImage(
        organization,
        brand,
        dbUserId,
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
  @ApiOperation({
    summary: 'Queue an image generation job for a character',
  })
  async createGenerateJob(
    @Req() request: Request,
    @Body() dto: GenerateImageDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const data = await this.adminFleetService.createGenerationJob(
        organization,
        brand,
        dbUserId,
        dto,
      );
      return serializeSingle(request, FleetGenerationJobSerializer, {
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
  @ApiOperation({
    summary: 'Get image generation job status',
  })
  async getGenerateJob(
    @Req() request: Request,
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.adminFleetService.getGenerationJob(
        jobId,
        organization,
      );
      return serializeSingle(request, FleetGenerationJobSerializer, {
        _id: data.jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getGenerateJob');
    }
  }

  @Post('lip-sync')
  @ApiOperation({
    summary: 'Generate lip sync video for a character',
  })
  async generateLipSync(
    @Req() request: Request,
    @Body() dto: GenerateLipSyncDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.adminFleetService.generateLipSync(
        organization,
        dto,
      );
      return serializeSingle(request, FleetLipSyncJobSerializer, {
        _id: data.jobId,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateLipSync');
    }
  }

  @Get('lip-sync/:jobId')
  @ApiOperation({
    summary: 'Get lip sync job status',
  })
  async getLipSyncStatus(
    @Req() request: Request,
    @Param('jobId') jobId: string,
  ) {
    try {
      const data = await this.adminFleetService.getLipSyncStatus(jobId);
      return serializeSingle(request, FleetLipSyncStatusSerializer, {
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

  @Get('voices')
  @ApiOperation({
    summary: 'List available TTS voices',
  })
  async listVoices(@Req() request: Request) {
    try {
      const data = await this.adminFleetService.getVoices();
      return serializeCollection(request, FleetVoiceSerializer, {
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
  @ApiOperation({
    summary: 'Generate TTS audio',
  })
  async generateVoice(
    @Req() request: Request,
    @Body() dto: AdminFleetGenerateVoiceDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.adminFleetService.generateVoice(
        organization,
        dto,
      );
      return serializeSingle(request, FleetGenerateVoiceResultSerializer, {
        _id: `voice:${Date.now()}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateVoice');
    }
  }

  @Get('trainings')
  @ApiOperation({
    summary: 'List trainings (optionally filtered by persona)',
  })
  async listTrainings(
    @Req() request: Request,
    @Query('personaSlug') personaSlug: string | undefined,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const trainings = await this.adminFleetService.getTrainings(
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
  @ApiOperation({
    summary: 'Get training details',
  })
  async getTraining(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const training = await this.adminFleetService.getTraining(
        id,
        organization,
      );
      return serializeSingle(request, TrainingSerializer, training);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getTraining');
    }
  }

  @Post('trainings')
  @ApiOperation({
    summary: 'Start LoRA training for a character',
  })
  async startTraining(
    @Req() request: Request,
    @Body() dto: StartTrainingDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const training = await this.adminFleetService.startTraining(
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
}

export { AdminFleetController as AdminFleetMediaController };
