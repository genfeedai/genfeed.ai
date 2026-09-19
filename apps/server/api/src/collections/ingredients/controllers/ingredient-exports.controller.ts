import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ExportIngredientDto } from '@api/collections/ingredients/dto/export-ingredient.dto';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { RequestTimeout } from '@api/helpers/decorators/request-timeout/request-timeout.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CleanExportAccessGuard } from '@api/helpers/guards/clean-export-access/clean-export-access.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { IngredientExportSerializer } from '@genfeedai/serializers';
import {
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
  @UseGuards(CleanExportAccessGuard)
  async export(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExportIngredientDto,
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
        dto.watermark,
      ),
    );
  }
}
