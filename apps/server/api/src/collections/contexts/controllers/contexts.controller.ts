import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  ContextBaseSerializer,
  ContextEntrySerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Contexts')
@Controller('contexts')
export class ContextsController {
  constructor(private readonly contextsService: ContextsService) {}

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
    const { organization, user: dbUserId } = getPublicMetadata(user);
    const data = await this.contextsService.create(dto, organization, dbUserId);
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
    // Pass the DB user ID (publicMetadata.user), not the legacy auth provider user ID (user.id).
    const { organization, user: dbUserId } = getPublicMetadata(user);
    const data = await this.contextsService.autoCreateFromAccount(
      dto,
      organization,
      dbUserId?.toString(),
    );
    return serializeSingle(req, ContextBaseSerializer, data);
  }

  /**
   * Retrieve context entries for direct prompt injection.
   */
  @Post('enhance')
  @UseGuards(SubscriptionGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async enhancePrompt(
    @Body() dto: EnhancePromptDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return this.contextsService.enhancePrompt(dto, organization);
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
}
