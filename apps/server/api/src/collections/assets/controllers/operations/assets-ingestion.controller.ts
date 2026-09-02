import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

const MAX_ASSET_UPLOAD_BYTES = 50 * 1024 * 1024;

@AutoSwagger()
@Controller('assets')
@UseGuards(RolesGuard)
export class AssetsIngestionController {
  constructor(
    private readonly ingestionService: AssetIngestionService,
    readonly loggerService: LoggerService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_ASSET_UPLOAD_BYTES,
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'AssetsOperationsController.createUpload',
    summary: 'createUpload',
  })
  async createUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        allowedMimeTypes: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
        ],
        maxSizeBytes: MAX_ASSET_UPLOAD_BYTES,
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: CreateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const asset = await this.ingestionService.createUpload(
      user,
      file,
      uploadDto,
    );

    return serializeSingle(request, AssetSerializer, asset);
  }

  @Post('from-ingredient')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'AssetsOperationsController.createFromIngredient',
    summary: 'createFromIngredient',
  })
  async createFromIngredient(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createFromIngredientDto: CreateFromIngredientDto,
  ): Promise<JsonApiSingleResponse> {
    const asset = await this.ingestionService.createFromIngredient(
      user,
      createFromIngredientDto,
    );

    return serializeSingle(request, AssetSerializer, asset);
  }
}
