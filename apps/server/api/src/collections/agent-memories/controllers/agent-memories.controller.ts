import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  AgentMemoryContentType,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { MemberRole } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
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
      const organization = user.organizationId;
      const dbUserId = user.userId ?? user.id;
      const entries = await this.memoriesService.listForUser(
        dbUserId,
        organization,
      );
      return entries;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'listMemories');
    }
  }

  @Get('organization')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary: 'List brand and org-wide memory entries for the organization',
  })
  async listOrganization(@CurrentUser() user: User) {
    try {
      return await this.memoriesService.listForOrganization(
        user.organizationId,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listOrganizationMemories',
      );
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
      const organization = user.organizationId;
      const dbUserId = user.userId ?? user.id;
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

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary:
      'Archive a brand or org-wide memory entry without hard-deleting it',
  })
  async archive(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      const memory = await this.memoriesService.archiveMemory(
        id,
        user.organizationId,
      );
      return memory;
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'archiveMemory');
    }
  }

  @Post(':id/promote')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary: 'Promote a brand or org-wide memory into a reusable skill',
  })
  async promote(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      return await this.memoriesService.promoteMemory(
        id,
        user.organizationId,
        user.userId ?? user.id,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'promoteMemory');
    }
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary: 'Reject a memory promotion without changing the memory',
  })
  async reject(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      return await this.memoriesService.rejectMemoryPromotion(
        id,
        user.organizationId,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'rejectMemoryPromotion',
      );
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
      const organization = user.organizationId;
      const dbUserId = user.userId ?? user.id;
      await this.memoriesService.removeMemory(id, dbUserId, organization);
      return { status: 'ok' };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteMemory');
    }
  }
}
