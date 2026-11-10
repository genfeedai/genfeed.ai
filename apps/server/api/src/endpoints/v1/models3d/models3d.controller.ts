import { CreateModel3dDto } from '@api/endpoints/v1/models3d/dto/create-model3d.dto';
import type {
  Models3dAuthenticatedRequest,
  Models3dResponse,
} from '@api/endpoints/v1/models3d/interfaces/models3d.interfaces';
import { MODELS3D_MAX_SOURCE_BYTES } from '@api/endpoints/v1/models3d/models3d.constants';
import {
  type Models3dActor,
  Models3dService,
} from '@api/endpoints/v1/models3d/services/models3d.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { ApiKeyScope } from '@genfeedai/contracts';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

const SOURCE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * API-key endpoints for the 3D render pipeline: a photo becomes a 3x3 angle
 * sheet, then a GLB. Generation stays in the app; this is not a prompt-bar
 * feature.
 */
@ApiTags('3D renders')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@Controller('models3d')
export class Models3dController {
  constructor(private readonly models3d: Models3dService) {}

  @Post()
  @RequiredScopes(ApiKeyScope.MODELS3D_WRITE)
  @ApiOperation({
    summary: 'Start a 3D render from an image (angle sheet, optionally a GLB)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fieldSize: 4096,
        fields: 4,
        fileSize: MODELS3D_MAX_SOURCE_BYTES,
        files: 1,
        parts: 5,
      },
    }),
  )
  create(
    @Req() request: Models3dAuthenticatedRequest,
    @Body() dto: CreateModel3dDto,
    @UploadedFile(
      new UploadValidationPipe({
        allowedMimeTypes: SOURCE_IMAGE_MIME_TYPES,
        maxSizeBytes: MODELS3D_MAX_SOURCE_BYTES,
        required: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<Models3dResponse> {
    return this.models3d.create(
      this.actor(request),
      dto,
      file ? { buffer: file.buffer, mimetype: file.mimetype } : undefined,
    );
  }

  @Get(':id')
  @RequiredScopes(ApiKeyScope.MODELS3D_READ)
  @ApiOperation({ summary: 'Get the status of a 3D render' })
  get(
    @Req() request: Models3dAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<Models3dResponse> {
    return this.models3d.get(this.actor(request), id);
  }

  @Post(':id/build')
  @RequiredScopes(ApiKeyScope.MODELS3D_WRITE)
  @ApiOperation({ summary: 'Build the GLB from a finished angle sheet' })
  build(
    @Req() request: Models3dAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<Models3dResponse> {
    return this.models3d.startBuild(this.actor(request), id);
  }

  @Get(':id/file')
  @RequiredScopes(ApiKeyScope.MODELS3D_READ)
  @ApiOperation({ summary: 'Signed URL of the finished GLB' })
  async file(
    @Req() request: Models3dAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    return { url: await this.models3d.getFileUrl(this.actor(request), id) };
  }

  private actor(request: Models3dAuthenticatedRequest): Models3dActor {
    const organizationId = request.user?.organizationId;
    const userId = request.user?.userId ?? request.user?.id;
    if (!organizationId || !userId) {
      throw new UnauthorizedException('API key is missing its organization');
    }
    return { brandId: request.user?.brandId, organizationId, userId };
  }
}
