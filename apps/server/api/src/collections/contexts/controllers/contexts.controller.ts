import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import type { User } from '@clerk/backend';
import {
  ContextBaseSerializer,
  ContextEntrySerializer,
} from '@genfeedai/serializers';
import { ActivitySource } from '@genfeedai/enums';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Contexts')
@Controller('contexts')
@UseInterceptors(CreditsInterceptor)
export class ContextsController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly contextsService: ContextsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Create a new context base
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @Body() dto: CreateContextDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contextsService.create(dto, organization, user.id);
    return serializeSingle(req, ContextBaseSerializer, data);
  }

  /**
   * Get all context bases
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const docs = await this.contextsService.findAll(organization, {
      category,
      isActive: isActive ? isActive === 'true' : undefined,
      search,
    });
    return serializeCollection(req, ContextBaseSerializer, { docs });
  }

  /**
   * Get one context base
   */
  @Get(':contextId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('contextId') contextId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contextsService.findOne(contextId, organization);
    return serializeSingle(req, ContextBaseSerializer, data);
  }

  /**
   * Update context base
   */
  @Patch(':contextId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @Param('contextId') contextId: string,
    @Body() dto: UpdateContextDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contextsService.update(
      contextId,
      dto,
      organization,
    );
    return serializeSingle(req, ContextBaseSerializer, data);
  }

  /**
   * Delete context base
   */
  @Delete(':contextId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('contextId') contextId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.contextsService.remove(contextId, organization);
    return { message: 'Context base deleted successfully' };
  }

  /**
   * Add entry to context base
   */
  @Post(':contextId/entries')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addEntry(
    @Req() req: Request,
    @Param('contextId') contextId: string,
    @Body() dto: AddEntryDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contextsService.addEntry(
      contextId,
      dto,
      organization,
    );
    return serializeSingle(req, ContextEntrySerializer, data);
  }

  /**
   * Remove entry from context base
   */
  @Delete(':contextId/entries/:entryId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeEntry(
    @Param('contextId') contextId: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.contextsService.removeEntry(contextId, entryId, organization);
    return { message: 'Entry removed successfully' };
  }

  /**
   * Auto-create context from social brand
   */
  @Post('autocreate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async autoCreateFromAccount(
    @Req() req: Request,
    @Body() dto: AutoCreateContextDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contextsService.autoCreateFromAccount(
      dto,
      organization,
      user.id,
    );
    return serializeSingle(req, ContextBaseSerializer, data);
  }

  /**
   * Enhance prompt with RAG
   */
  @Post('enhance')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'RAG prompt enhancement (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async enhancePrompt(
    @Req() req: Request,
    @Body() dto: EnhancePromptDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const result = await this.contextsService.enhancePrompt(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result;
  }

  /**
   * Query context base
   */
  @Post('query')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async queryContext(@Body() dto: QueryContextDto, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    return await this.contextsService.queryContext(dto, organization);
  }

  /**
   * Get context base stats
   */
  @Get(':contextId/stats')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getStats(
    @Param('contextId') contextId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.contextsService.getStats(contextId, organization);
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    throw new HttpException(
      {
        detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
        title: 'Insufficient credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async getDefaultTextMinimumCredits(): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      return 0;
    }

    if (model.pricingType === 'per-token') {
      return getMinimumTextCredits(model);
    }

    return model.cost || 0;
  }

  private finalizeDeferredCredits(request: Request, amount: number): void {
    const reqWithCredits = request as Request & {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        maxOverdraftCredits?: number;
      };
    };

    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount,
      deferred: false,
      maxOverdraftCredits: ContextsController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
