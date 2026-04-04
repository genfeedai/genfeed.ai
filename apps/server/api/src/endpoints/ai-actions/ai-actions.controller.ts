import type { AiActionResult } from '@api/endpoints/ai-actions/ai-actions.service';
import { AiActionsService } from '@api/endpoints/ai-actions/ai-actions.service';
import { ExecuteAiActionDto } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

@Controller('organizations/:organizationId/ai-actions')
@UseGuards(RolesGuard)
export class AiActionsController {
  constructor(private readonly aiActionsService: AiActionsService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  execute(
    @Param('organizationId') organizationId: string,
    @Body() dto: ExecuteAiActionDto,
  ): Promise<AiActionResult> {
    return this.aiActionsService.execute(organizationId, dto);
  }
}
