import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { AgentMessageRole, AgentThreadStatus } from '@genfeedai/enums';
import {
  AgentThreadSerializer,
  ThreadMessageSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
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
@Controller('threads')
export class AgentThreadsController {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List user agent threads' })
  async listThreads(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('status') status?: string,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const parsedStatus = Object.values(AgentThreadStatus).includes(
        status as AgentThreadStatus,
      )
        ? (status as AgentThreadStatus)
        : undefined;
      const docs = await this.agentThreadsService.getUserThreads(
        dbUserId,
        organizationId,
        parsedStatus,
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

      const messages = await this.agentMessagesService.getMessagesByRoom(
        threadId,
        organizationId,
        { cursor, limit: messageLimit },
      );

      const chronological = [...messages].reverse();

      return serializeCollection(req, ThreadMessageSerializer, {
        docs: chronological,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getMessages');
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
        _id: threadId,
        isDeleted: false,
        organization: organizationId,
      });
      return serializeSingle(req, AgentThreadSerializer, thread);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getThread');
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new agent thread' })
  async createThread(
    @Req() req: Request,
    @Body() body: { title?: string; source?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
      const thread = await this.agentThreadsService.create({
        organizationId,
        source: body.source || 'web',
        title: body.title,
        userId: dbUserId,
      } as Record<string, unknown>);
      return serializeSingle(req, AgentThreadSerializer, thread);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createThread');
    }
  }

  @Post('archive-all')
  @ApiOperation({ summary: 'Archive all active threads for the current user' })
  async archiveAllThreads(@CurrentUser() user: User) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);

      return {
        archivedCount: await this.agentThreadsService.archiveAllThreads(
          dbUserId,
          organizationId,
        ),
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'archiveAllThreads',
      );
    }
  }

  @Post(':threadId/messages')
  @ApiOperation({ summary: 'Add a message to a thread' })
  async addMessage(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: { content: string; role?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const dbUserId = await this.resolveMongoUserId(user);
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
    const { organization } = getPublicMetadata(user);
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
   * `getPublicMetadata(user).user` directly, with no DB re-lookup. That value
   * is populated once per request by AuthIdentityResolverService and is
   * exactly the id AgentThread.userId expects.
   *
   * Previously this re-derived the id via `usersService.findOne({ _id,
   * authProviderId })` — an AND filter requiring the stored (legacy)
   * `authProviderId` column to match the current auth-provider subject. For
   * users where that legacy field doesn't line up (e.g. Better-Auth users,
   * or any account reconciled by AuthIdentityResolverService's fallback
   * paths), both that lookup and its `{ authProviderId }` fallback missed,
   * throwing UnauthorizedException for an already-authenticated user. That
   * is the exact 401 loop reported on GET /v1/threads while every other
   * authenticated endpoint (which trusts publicMetadata.user with no
   * re-lookup) kept returning 200 for the same token.
   *
   * The DB lookup below is retained only as a last-resort fallback for the
   * rare case where publicMetadata carries no user id at all, and it must
   * never throw for an authenticated user based on a legacy field mismatch.
   */
  private async resolveMongoUserId(user: User): Promise<string> {
    const { user: metadataUserId } = getPublicMetadata(user);
    if (metadataUserId) {
      return metadataUserId;
    }

    const authProviderId = user.id;
    if (!authProviderId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const dbUser = await this.usersService.findOne({ authProviderId }, []);
    const fallbackUserId = dbUser?.id ?? dbUser?._id;
    if (!fallbackUserId) {
      throw new UnauthorizedException('User account not found');
    }

    return String(fallbackUserId);
  }
}
