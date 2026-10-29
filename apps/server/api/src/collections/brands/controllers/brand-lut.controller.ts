import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandLutService } from '@api/collections/brands/services/brand-lut.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import { BRAND_LUT_LIMITS } from '@genfeedai/contracts/constants';
import { BrandSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Delete,
  ForbiddenException,
  Param,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands/:brandId/lut')
@UseGuards(RolesGuard)
@RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
export class BrandLutController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly luts: BrandLutService,
  ) {}

  /** Stores the `.cube` file, replacing the brand's current LUT. */
  @Put()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fieldSize: 1024,
        fields: 0,
        fileSize: BRAND_LUT_LIMITS.MAX_BYTES,
        files: 1,
      },
    }),
  )
  async upload(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['cube'],
        allowedMimeTypes: [
          'application/octet-stream',
          'text/plain',
          'application/x-cube-lut',
        ],
        maxSizeBytes: BRAND_LUT_LIMITS.MAX_BYTES,
      }),
    )
    file: Express.Multer.File,
  ) {
    const organizationId = this.organizationId(user);
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    await verifyBrandAccess(this.brandsService, id, user);
    await this.luts.upload(id, organizationId, file);
    return serializeSingle(
      request,
      BrandSerializer,
      await verifyBrandAccess(this.brandsService, id, user),
    );
  }

  /** Removes the LUT and turns the grade off. */
  @Delete()
  async remove(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ) {
    const organizationId = this.organizationId(user);
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    await verifyBrandAccess(this.brandsService, id, user);
    await this.luts.remove(id, organizationId);
    return serializeSingle(
      request,
      BrandSerializer,
      await verifyBrandAccess(this.brandsService, id, user),
    );
  }

  private organizationId(user: AuthenticatedUser): string {
    if (!user.organizationId) throw new ForbiddenException();
    return user.organizationId;
  }
}
