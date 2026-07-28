import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import {
  CreateCharacterDto,
  UpdateCharacterDto,
  UploadDatasetDto,
} from '@api/endpoints/admin/fleet/dto';
import { AdminFleetService } from '@api/endpoints/admin/fleet/fleet.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  FleetUploadDatasetResultSerializer,
  PersonaSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Fleet')
@Controller(['admin/fleet', 'admin/darkroom'])
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminFleetController {
  constructor(
    private readonly adminFleetService: AdminFleetService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('characters')
  @ApiOperation({ summary: 'List all fleet characters' })
  async listCharacters(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const characters =
        await this.adminFleetService.getCharacters(organization);
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
      const character = await this.adminFleetService.getCharacterBySlug(
        slug,
        organization,
      );
      return serializeSingle(request, PersonaSerializer, character);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getCharacter');
    }
  }

  @Post('characters')
  @ApiOperation({ summary: 'Create a new fleet character' })
  async createCharacter(
    @Req() request: Request,
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, brand, user: dbUserId } = getPublicMetadata(user);
      const userId = EntityIdUtil.toValidId(dbUserId)!;
      const organizationId = EntityIdUtil.toValidId(organization)!;
      const brandId = EntityIdUtil.toValidId(brand)!;

      const character = await this.adminFleetService.createCharacter({
        ...dto,
        brand: brandId,
        organization: organizationId,
        user: userId,
      } as Parameters<AdminFleetService['createCharacter']>[0]);
      return serializeSingle(request, PersonaSerializer, character);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createCharacter');
    }
  }

  @Patch('characters/:slug')
  @ApiOperation({ summary: 'Update a fleet character' })
  async updateCharacter(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const character = await this.adminFleetService.getCharacterBySlug(
        slug,
        organization,
      );
      const updated = await this.adminFleetService.updateCharacter(
        character.id.toString(),
        dto as Record<string, unknown>,
      );
      return serializeSingle(request, PersonaSerializer, updated);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'updateCharacter');
    }
  }

  @Delete('characters/:slug')
  @ApiOperation({ summary: 'Soft-delete a fleet character' })
  async deleteCharacter(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const character = await this.adminFleetService.getCharacterBySlug(
        slug,
        organization,
      );
      const deleted = await this.adminFleetService.updateCharacter(
        character.id.toString(),
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
      const data = await this.adminFleetService.uploadDataset(
        organization,
        slug,
        (files.images ?? []).map((file) => ({
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
        })),
        dto.captions,
      );
      return serializeSingle(request, FleetUploadDatasetResultSerializer, {
        _id: `dataset:${slug}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'uploadDataset');
    }
  }

  @Post('characters/:slug/training-data')
  @ApiOperation({
    summary: 'Generate persona training data from enabled fleet sources',
  })
  async generateCharacterTrainingData(
    @Req() request: Request,
    @Param('slug') slug: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const data = await this.adminFleetService.ingestTrainingDataForCharacter(
        organization,
        dbUserId,
        slug,
      );

      return serializeSingle(request, FleetUploadDatasetResultSerializer, {
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
      'Generate training data for all enabled fleet personas in enabled brands',
  })
  async generateAllTrainingData(
    @Req() request: Request,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const data =
        await this.adminFleetService.ingestTrainingDataForAllEnabledCharacters(
          organization,
          dbUserId,
        );

      return serializeSingle(request, FleetUploadDatasetResultSerializer, {
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
}
