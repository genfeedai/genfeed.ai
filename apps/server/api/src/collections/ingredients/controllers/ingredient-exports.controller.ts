import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ExportIngredientDto } from '@api/collections/ingredients/dto/export-ingredient.dto';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { IngredientExportSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientExportsController {
  constructor(private readonly exports: IngredientExportService) {}
  @Post(':id/export')
  async export(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExportIngredientDto,
  ) {
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
