import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';
import { TemplatesQueryDto } from '@api/collections/templates/dto/templates-query.dto';
import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';
import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
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
import { TemplateFilterUtil } from '@api/helpers/utils/template-filter/template-filter.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import type { User } from '@clerk/backend';
import { ActivitySource } from '@genfeedai/enums';
import { TemplateSerializer } from '@genfeedai/serializers';
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
@ApiTags('Templates')
@Controller('templates')
@UseInterceptors(CreditsInterceptor)
export class TemplatesController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Create a new template
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const template = await this.templatesService.create(
      dto,
      organization,
      user.id,
    );
    return serializeSingle(request, TemplateSerializer, template);
  }

  /**
   * Get all templates
   * Uses TemplateFilterUtil for consistent filter building
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: TemplatesQueryDto,
  ) {
    const { organization } = getPublicMetadata(user);

    // Use TemplateFilterUtil to build filters
    const filters = TemplateFilterUtil.buildTemplateFilters(query);

    const templates = await this.templatesService.findAll(
      organization,
      filters,
    );

    return serializeCollection(request, TemplateSerializer, {
      docs: templates,
    });
  }

  // ============================================================================
  // Prompt Template Endpoints (must come before :id routes)
  // ============================================================================

  /**
   * List prompt templates
   * Uses TemplateFilterUtil for consistent filter building
   */
  @Get('prompts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listPromptTemplates(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: TemplatesQueryDto,
  ) {
    const { organization } = getPublicMetadata(user);

    // Use TemplateFilterUtil to build filters with purpose: 'prompt'
    const filters = TemplateFilterUtil.buildTemplateFilters({
      ...query,
      purpose: 'prompt',
    });

    const templates = await this.templatesService.findAll(
      organization,
      filters,
    );
    return serializeCollection(request, TemplateSerializer, {
      docs: templates,
    });
  }

  /**
   * Create prompt template
   */
  @Post('prompts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createPromptTemplate(
    @Req() request: Request,
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    // Ensure purpose is set to 'prompt'
    const promptDto = { ...dto, purpose: 'prompt' as const };
    const template = await this.templatesService.create(
      promptDto,
      organization,
      user.id,
    );
    return serializeSingle(request, TemplateSerializer, template);
  }

  /**
   * Update prompt template
   */
  @Patch('prompts/:templateId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updatePromptTemplate(
    @Req() request: Request,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const template = await this.templatesService.update(
      templateId,
      dto,
      organization,
    );
    return serializeSingle(request, TemplateSerializer, template);
  }

  /**
   * Delete prompt template
   */
  @Delete('prompts/:templateId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removePromptTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.templatesService.remove(templateId, organization);
    return { message: 'Prompt template deleted successfully' };
  }

  /**
   * Get one template
   */
  @Get(':templateId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('templateId') templateId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const template = await this.templatesService.findOne(
      templateId,
      organization,
    );
    return serializeSingle(request, TemplateSerializer, template);
  }

  /**
   * Update template
   */
  @Patch(':templateId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const template = await this.templatesService.update(
      templateId,
      dto,
      organization,
    );
    return serializeSingle(request, TemplateSerializer, template);
  }

  /**
   * Delete template
   */
  @Delete(':templateId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('templateId') templateId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.templatesService.remove(templateId, organization);
    return { message: 'Template deleted successfully' };
  }

  /**
   * Use template (fill variables)
   */
  @Post(':templateId/use')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Template AI refinement (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async useTemplate(
    @Req() req: Request,
    @Body() dto: UseTemplateDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    if (dto.additionalInstructions?.trim()) {
      await this.assertOrganizationCreditsAvailable(
        organization,
        await this.getDefaultTextMinimumCredits(),
      );
    }
    let billedCredits = 0;
    const result = await this.templatesService.useTemplate(
      dto,
      organization,
      user.id,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result; // Returns filled template content, not a template document
  }

  /**
   * Get template suggestions
   */
  @Post('suggest')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Template suggestion ranking (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async suggestTemplates(
    @Req() request: Request,
    @Body() dto: SuggestTemplatesDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const templates = await this.templatesService.suggestTemplates(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(request, billedCredits);
    return serializeCollection(request, TemplateSerializer, {
      docs: templates,
    });
  }

  /**
   * Get popular templates
   */
  @Get('popular')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getPopularTemplates(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const templates = await this.templatesService.getPopularTemplates(
      organization,
      limit ? parseInt(limit, 10) : 10,
    );
    return serializeCollection(request, TemplateSerializer, {
      docs: templates,
    });
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
      maxOverdraftCredits: TemplatesController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
