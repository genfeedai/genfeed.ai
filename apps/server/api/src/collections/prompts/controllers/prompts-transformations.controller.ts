import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import { PromptTransformationService } from '@api/collections/prompts/services/prompt-transformation.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PromptSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('prompts')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class PromptsTransformationsController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly promptTransformationService: PromptTransformationService,
  ) {}

  @Post('parse')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'PromptsOperationsController.parse',
    summary: 'parse',
  })
  parse(@Body() dto: ParsePromptDto, @CurrentUser() user: User) {
    return this.promptTransformationService.parse(dto, user);
  }

  @Post(':promptId/remix')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Remix prompt generation using AI',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.PROMPT_REMIX,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'PromptsOperationsController.createRemix',
    summary: 'createRemix',
  })
  async createRemix(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const prompt = await this.promptTransformationService.createRemix(
      request,
      promptId,
      user,
    );

    return serializeSingle(request, PromptSerializer, prompt);
  }

  @Post(':promptId/enhance')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Prompt enhancement using AI',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.PROMPT_ENHANCEMENT,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'PromptsOperationsController.enhanceExisting',
    summary: 'enhanceExisting',
  })
  async enhanceExisting(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const prompt = await this.promptTransformationService.enhanceExisting(
      promptId,
      user,
    );

    return serializeSingle(request, PromptSerializer, prompt);
  }
}
