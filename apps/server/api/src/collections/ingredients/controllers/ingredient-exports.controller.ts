import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { RequestTimeout } from '@api/helpers/decorators/request-timeout/request-timeout.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  WATERMARK_VARIANTS,
  type WatermarkVariant,
} from '@genfeedai/contracts/interfaces';
import { IngredientExportSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientExportsController {
  constructor(private readonly exports: IngredientExportService) {}
  @Post(':id/export')
  @RequestTimeout(600_000)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  async export(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body?: { variant?: unknown },
  ) {
    if (!user.organizationId)
      throw new ForbiddenException(
        'An organization is required to export a preview',
      );
    return serializeSingle(
      request,
      IngredientExportSerializer,
      await this.exports.export(
        id,
        user.organizationId.toString(),
        this.readVariant(body?.variant),
      ),
    );
  }

  private readVariant(value: unknown): WatermarkVariant {
    if (value === undefined) return 'default';
    const variant = WATERMARK_VARIANTS.find((item) => item === value);
    if (!variant) throw new BadRequestException('Unknown watermark variant');
    return variant;
  }
}
