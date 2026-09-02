import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAgentTransferDto } from '@api/collections/agent-transfers/dto/create-agent-transfer.dto';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  AgentThreadSerializer,
  AgentTransferSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Transfers')
@Controller('agent/transfers')
export class AgentTransfersController {
  constructor(
    private readonly agentTransfersService: AgentTransfersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Discover authorized destination conversations' })
  async discoverConversations(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('sourceThreadId') sourceThreadId: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const docs = await this.agentTransfersService.discoverConversations(
        this.actor(user),
        sourceThreadId,
        query,
        limit ? Number.parseInt(limit, 10) : undefined,
      );
      return serializeCollection(req, AgentThreadSerializer, { docs });
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'discoverAgentTransferConversations',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'List transfers for an authorized conversation' })
  async list(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('threadId') threadId: string,
  ) {
    try {
      const docs = await this.agentTransfersService.listForThread(
        this.actor(user),
        threadId,
      );
      return serializeCollection(req, AgentTransferSerializer, {
        docs: docs.map(this.presentTransfer),
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listAgentTransfers',
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one authorized transfer' })
  async getOne(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    try {
      const transfer = await this.agentTransfersService.findOne(
        this.actor(user),
        id,
      );
      return serializeSingle(
        req,
        AgentTransferSerializer,
        this.presentTransfer(transfer),
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getAgentTransfer',
      );
    }
  }

  @Post()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Send or explicitly send-and-run a transfer' })
  async create(
    @Req() req: Request,
    @Body() body: CreateAgentTransferDto,
    @CurrentUser() user: User,
  ) {
    try {
      const transfer = await this.agentTransfersService.create(body, {
        ...this.actor(user),
      });
      return serializeSingle(
        req,
        AgentTransferSerializer,
        this.presentTransfer(transfer),
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createAgentTransfer',
      );
    }
  }

  @Post(':id/retry')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Retry a failed send-and-run transfer' })
  async retry(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    try {
      const transfer = await this.agentTransfersService.retry(id, {
        ...this.actor(user),
      });
      return serializeSingle(
        req,
        AgentTransferSerializer,
        this.presentTransfer(transfer),
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'retryAgentTransfer',
      );
    }
  }

  private actor(user: User) {
    if (!user.organizationId || !(user.userId ?? user.id)) {
      throw new UnauthorizedException(
        'Invalid user or organization context. Please sign in again.',
      );
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }

  private readonly presentTransfer = (value: unknown) => {
    const transfer = value as Record<string, unknown>;
    const sourceThread = transfer.sourceThread as
      | { title?: string | null }
      | undefined;
    const destinationThread = transfer.destinationThread as
      | { title?: string | null }
      | undefined;
    return {
      ...transfer,
      destinationThreadTitle: destinationThread?.title ?? null,
      sourceThreadTitle: sourceThread?.title ?? null,
    };
  };
}
