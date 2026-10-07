import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandFontAssetsQueryDto } from '@api/collections/brands/dto/brand-font-assets-query.dto';
import { UploadBrandFontDto } from '@api/collections/brands/dto/upload-brand-font.dto';
import {
  type BrandFontActor,
  BrandFontAssetsService,
} from '@api/collections/brands/services/brand-font-assets.service';
import { FONT_UPLOAD_MAX_BYTES } from '@api/collections/brands/utils/brand-font-upload.util';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import { BrandFontAssetSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Request, Response } from 'express';
@AutoSwagger()
@Controller('brands/:brandId/font-assets')
@UseGuards(RolesGuard)
export class BrandFontAssetsController {
  constructor(private readonly fonts: BrandFontAssetsService) {}
  private actor(user: AuthenticatedUser, brandId: string): BrandFontActor {
    const actorId = user.userId ?? user.id;
    if (!user.organizationId || !actorId)
      throw new ForbiddenException('font_asset_access_denied');
    return {
      organizationId: user.organizationId,
      actorId,
      brandId: InputValidationUtil.validateEntityId(brandId, 'brandId'),
    };
  }
  @TenantReadPolicy('owner')
  @Get()
  async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: BrandFontAssetsQueryDto,
  ) {
    const result = await this.fonts.list(this.actor(user, brandId), query);
    return serializeCollection(req, BrandFontAssetSerializer, { ...result });
  }
  @Post()
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: FONT_UPLOAD_MAX_BYTES,
        files: 1,
        fields: 2,
        parts: 3,
        fieldSize: 1024,
      },
    }),
  )
  async upload(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: UploadBrandFontDto,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['woff2'],
        allowedMimeTypes: ['font/woff2', 'application/octet-stream'],
        maxSizeBytes: FONT_UPLOAD_MAX_BYTES,
      }),
    )
    file: Express.Multer.File,
  ) {
    const actor = this.actor(user, brandId);
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) abort();
    };
    req.on('aborted', abort);
    res.on('close', close);
    if (req.aborted) abort();
    try {
      const result = await this.fonts.upload(
        actor,
        { ...dto, file },
        controller.signal,
      );
      res.status(result.created ? 201 : 200);
      return serializeSingle(req, BrandFontAssetSerializer, result.asset);
    } finally {
      req.off('aborted', abort);
      res.off('close', close);
    }
  }
  @Delete(':assetId')
  @HttpCode(204)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('assetId') assetId: string,
  ): Promise<void> {
    await this.fonts.remove(
      this.actor(user, brandId),
      InputValidationUtil.validateEntityId(assetId, 'assetId'),
    );
  }
}
