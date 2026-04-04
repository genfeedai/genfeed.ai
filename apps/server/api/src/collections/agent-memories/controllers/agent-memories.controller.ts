import type {
  AgentMemoryContentType,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Memories')
@Controller('agent/memories')
export class AgentMemoriesController {
  constructor(
    private readonly memoriesService: AgentMemoriesService,
    private readonly memoryCaptureService: AgentMemoryCaptureService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List memory entries for the user' })
  async list(@Req() req: Request, @CurrentUser() user: User) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const entries = await this.memoriesService.listForUser(
        dbUserId,
        organization,
      );
      return entries;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'listMemories');
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new memory entry' })
  async create(
    @Req() req: Request,
    @Body() body: {
      campaignId?: string;
      content: string;
      summary?: string;
      tags?: string[];
      sourceMessageId?: string;
      kind?: AgentMemoryKind;
      scope?: AgentMemoryScope;
      contentType?: AgentMemoryContentType;
      brandId?: string;
      platform?: string;
      sourceType?: string;
      sourceUrl?: string;
      sourceContentId?: string;
      importance?: number;
      confidence?: number;
      performanceSnapshot?: Record<string, unknown>;
      saveToContextMemory?: boolean;
    },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const result = await this.memoryCaptureService.capture(
        dbUserId,
        organization,
        body,
      );
      return {
        ...result.memory,
        wroteBrandInsight: result.wroteBrandInsight,
        wroteContextMemory: result.wroteContextMemory,
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createMemory');
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a memory entry' })
  async remove(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      await this.memoriesService.removeMemory(id, dbUserId, organization);
      return { status: 'ok' };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteMemory');
    }
  }
}
