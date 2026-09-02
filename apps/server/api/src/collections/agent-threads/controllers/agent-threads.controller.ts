import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { UpdateAgentThreadContextDto } from '@api/collections/agent-threads/dto/update-agent-thread-context.dto';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { AgentScopeContextService, scopedWhere } from '@api/index';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentMessageRole, AgentThreadStatus } from '@genfeedai/enums';
import {
  AgentThreadSerializer,
  ThreadMessageSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Threads')
@Controller('agent/threads')
export class AgentThreadsController {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List user agent threads (optional brand scope for single-brand workspace chat)',
  })
  async listThreads(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('brand') brand?: string,
    @Query('source') source?: string,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveDatabaseUserId(user);
      const parsedStatus = Object.values(AgentThreadStatus).includes(
        status as AgentThreadStatus,
      )
        ? (status as AgentThreadStatus)
        : undefined;
      // Brand selected → hard filter to that brand. Brand cleared → full org.
      const brandId = brand?.trim() ? brand.trim() : undefined;
      // Entry-point filter. Onboarding resume queries `source=onboarding` so
      // the newest onboarding thread is found regardless of how many newer
      // standard threads exist.
      const threadSource = source?.trim() ? source.trim() : undefined;
      const docs = await this.agentThreadsService.getUserThreads(
        dbUserId,
        organizationId,
        parsedStatus,
        brandId,
        threadSource,
      );
      return serializeCollection(req, AgentThreadSerializer, {
        docs,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'listThreads');
    }
  }

  @Get(':threadId/messages')
  @ApiOperation({ summary: 'Get messages for a thread' })
  async getMessages(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const messageLimit = limit ? Number.parseInt(limit, 10) : 50;

      const page = await this.agentMessagesService.getMessagesPage(
        threadId,
        organizationId,
        { cursor, limit: messageLimit },
      );

      const chronological = [...page.docs].reverse();

      return serializeCollection(req, ThreadMessageSerializer, {
        docs: chronological,
        hasMore: page.hasMore,
        limit: messageLimit,
        nextCursor: page.nextCursor,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getMessages');
    }
  }

  @Get(':threadId/messages/:messageId/artifact-references')
  @ApiOperation({
    summary: 'Resolve canonical artifact references for a thread message',
  })
  async resolveMessageArtifactReferences(
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const references =
        await this.agentMessagesService.resolveMessageArtifactReferences(
          threadId,
          messageId,
          organizationId,
          { client: 'api', deployment: 'server' },
        );

      return { data: references };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'resolveMessageArtifactReferences',
      );
    }
  }

  @Get(':threadId/messages/:messageId')
  @ApiOperation({ summary: 'Get a single thread message' })
  async getMessage(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const message = await this.agentMessagesService.findOne({
        id: messageId,
        organizationId: organizationId,
        threadId,
      });

      return serializeSingle(req, ThreadMessageSerializer, message);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getMessage');
    }
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get thread by ID' })
  async getThread(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const thread = await this.agentThreadsService.findOne({
        id: threadId,
        organizationId: organizationId,
      });
      return serializeSingle(req, AgentThreadSerializer, thread);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getThread');
    }
  }

  @Post()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Create a new agent thread' })
  async createThread(
    @Req() req: Request,
    @Body() body: { brandId?: string | null; title?: string; source?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveDatabaseUserId(user);
      const preparedScope = await this.agentScopeContextService.prepareForTurn({
        organizationId,
        requestedBrandId: body.brandId,
        userId: dbUserId,
      });
      const thread = await this.agentThreadsService.create({
        ...preparedScope.initialScopeFields,
        organizationId,
        source: body.source || 'web',
        title: body.title,
        userId: dbUserId,
      });
      return serializeSingle(req, AgentThreadSerializer, thread);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createThread');
    }
  }

  @Patch(':threadId/context')
  @ApiOperation({ summary: 'Compare-and-swap the thread brand context' })
  async updateThreadContext(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: UpdateAgentThreadContextDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveDatabaseUserId(user);
      const updated = await this.agentScopeContextService.mutateBrandScope({
        brandId: body.brandId,
        expectedContextVersion: body.expectedContextVersion,
        organizationId,
        threadId,
        userId,
      });

      return serializeSingle(req, AgentThreadSerializer, updated);
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'updateThreadContext',
      );
    }
  }

  @Patch()
  @ApiOperation({
    summary:
      "Bulk-update the current user's threads by filter (currently archives all active threads)",
  })
  async bulkUpdateThreads(
    @Body() body: { status?: AgentThreadStatus; brandId?: string | null },
    @CurrentUser() user: User,
  ) {
    try {
      // Mass-by-filter: no ids, acts on the caller's own ACTIVE threads
      // (optionally brand-scoped). Only the archive transition is supported today.
      if (body.status !== AgentThreadStatus.ARCHIVED) {
        throw new BadRequestException(
          "Only { status: 'archived' } is supported for bulk thread updates",
        );
      }

      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveDatabaseUserId(user);
      const brandId = body.brandId?.trim() ? body.brandId.trim() : undefined;

      return {
        archivedCount: await this.agentThreadsService.archiveAllThreads(
          dbUserId,
          organizationId,
          brandId,
        ),
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'bulkUpdateThreads',
      );
    }
  }

  @Post(':threadId/messages')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Add a message to a thread' })
  async addMessage(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: { content: string; role?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveDatabaseUserId(user);
      const thread = await this.agentThreadsService.findOne(
        scopedWhere(organizationId, {
          id: threadId,
          isDeleted: false,
        }),
      );
      const status = String(
        (thread as { status?: string | null } | null)?.status ?? '',
      ).toLowerCase();
      if (status === AgentThreadStatus.ARCHIVED || status === 'archived') {
        throw new BadRequestException(
          'This thread is archived. Unarchive it before sending messages or running actions.',
        );
      }
      const message = await this.agentMessagesService.addMessage({
        content: body.content,
        organizationId,
        role: (body.role as AgentMessageRole) || AgentMessageRole.USER,
        room: threadId,
        userId: dbUserId,
      });

      return serializeSingle(req, ThreadMessageSerializer, message);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'addMessage');
    }
  }

  @Patch(':threadId')
  @ApiOperation({ summary: 'Update thread metadata or status' })
  async updateThread(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: {
      isPinned?: boolean;
      planModeEnabled?: boolean;
      requestedModel?: string;
      runtimeKey?: string;
      title?: string;
      systemPrompt?: string;
      memoryEntryIds?: string[];
      status?: AgentThreadStatus;
    },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const updated =
        body.status === AgentThreadStatus.ARCHIVED
          ? await this.agentThreadsService.archiveThread(
              threadId,
              organizationId,
            )
          : body.status === AgentThreadStatus.ACTIVE
            ? await this.agentThreadsService.unarchiveThread(
                threadId,
                organizationId,
              )
            : await this.agentThreadsService.updateThreadMetadata(
                threadId,
                organizationId,
                body,
              );
      return serializeSingle(req, AgentThreadSerializer, updated);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'updateThread');
    }
  }

  private resolveOrganizationId(user: User): string {
    const organization = user.organizationId;
    if (!organization) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    return organization;
  }

  /**
   * Resolve the internal (cuid) User.id that AgentThread.userId is a foreign
   * key to. This must trust the already-authenticated identity the same way
   * every other working endpoint does (see UsersController): read
   * `(user.userId ?? user.id)` directly, with no DB re-lookup. That value
   * is populated once per request by the registered Better Auth identity
   * resolver and is exactly the id AgentThread.userId expects.
   *
   * The DB lookup below is retained only as a last-resort fallback for the
   * rare case where identity carries no user id at all. It resolves
   * `user.id` as the canonical primary key; an unresolved subject fails with
   * 401 rather than being reinterpreted as an external identifier.
   */
  private async resolveDatabaseUserId(user: User): Promise<string> {
    const metadataUserId = user.userId ?? user.id;
    if (metadataUserId) {
      return metadataUserId;
    }

    const userId = user.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const dbUser = await this.usersService.findOne({ id: userId }, []);
    const fallbackUserId = dbUser?.id;
    if (!fallbackUserId) {
      throw new UnauthorizedException('User account not found');
    }

    return String(fallbackUserId);
  }
}
