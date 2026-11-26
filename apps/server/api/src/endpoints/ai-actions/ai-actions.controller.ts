import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  AiActionResult,
  AiActionsService,
} from '@api/endpoints/ai-actions/ai-actions.service';
import { ExecuteAiActionDto } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
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
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(HttpStatus.OK)
  execute(
    @Param('organizationId') organizationId: string,
    @Body() dto: ExecuteAiActionDto,
    @CurrentUser() user?: User,
  ): Promise<AiActionResult> {
    return this.aiActionsService.execute(organizationId, dto, {
      brandId: user?.brandId,
      userId: user?.userId,
    });
  }
}
