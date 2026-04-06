import { verifyToken } from '@clerk/backend';
import { resolveClerkSessionClaims } from '@helpers/auth/clerk-session-claims.helper';
import type {
  AssetStatusData,
  BackgroundTaskUpdateData,
  ClientInfo,
  ConnectionStatus,
  FileProcessingData,
  IngredientStatusData,
  IngredientUpdateMessage,
  MediaFailedEvent,
  NotificationData,
  PostStatusData,
  PostUpdateMessage,
  SubscriptionUpdateMessage,
  TrainingStatusData,
  VideoCompleteEvent,
  VideoProgressEvent,
  VoteCreateMessage,
} from '@libs/interfaces/websockets.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { Inject, Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketServer,
  WebSocketGateway as WSGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { getUserRoomName } from './room-name.util';

@Injectable()
@WSGateway({
  namespace: '/',
})
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly context = { service: WebSocketGateway.name };
  private clients: Map<string, ClientInfo> = new Map();
  private userToSocket: Map<string, Set<string>> = new Map();
  private isServerReady = false;

  constructor(
    @Inject('ConfigService')
    private readonly configService: {
      get: (key: string) => string | undefined;
    }, // App-specific ConfigService
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('WebSocket Gateway initialized', {
      ...this.context,
      hasAdapter: !!this.server?.sockets?.adapter,
      hasRooms: !!this.server?.sockets?.adapter?.rooms,
      hasSockets: !!this.server?.sockets,
      hasToMethod: typeof this.server?.to === 'function',
      serverExists: !!this.server,
      serverKeys: this.server ? Object.keys(this.server).slice(0, 10) : [],
      serverType: typeof this.server,
    });

    // Delay Redis subscription to ensure server.sockets.adapter is fully ready
    // Use setTimeout instead of setImmediate for more reliable initialization
    setTimeout(() => {
      this.isServerReady =
        !!this.server && typeof this.server.to === 'function';
      this.logger.log('WebSocket server ready, subscribing to Redis channels', {
        ...this.context,
        hasRooms: !!this.server?.sockets?.adapter?.rooms,
        isServerReady: this.isServerReady,
      });
      this.subscribeToRedisChannels();
    }, 100);
  }

  private isServerOperational(): boolean {
    return (
      this.isServerReady &&
      !!this.server &&
      typeof this.server.to === 'function'
    );
  }

  private warnServerNotReady(eventType: string, data?: unknown): void {
    this.logger.warn(
      `WebSocket server not initialized, skipping ${eventType} event`,
      { ...this.context, data },
    );
  }

  private getTargetRoom(userId: string, room?: string): string {
    return room ?? getUserRoomName(userId);
  }

  private subscribeToRedisChannels(): void {
    const channels = [
      'agent-chat',
      'video-progress',
      'video-complete',
      'media-failed',
      'notifications',
      'ingredient-status',
      'post-status',
      'training-status',
      'file-processing',
      'asset-status',
      'article-status',
      'background-task-update',
      'generic-events',
    ];

    for (const channel of channels) {
      void this.redisService.subscribe(channel);
    }

    this.redisService.on('message', (channel: string, message: string) => {
      try {
        const data: unknown = JSON.parse(message);
        this.logger.debug('Received Redis message', {
          channel,
          serverState: {
            hasToMethod: typeof this.server?.to === 'function',
            serverExists: !!this.server,
          },
        });
        this.handleRedisMessage(channel, data);
      } catch (error: unknown) {
        this.logger.error(
          `Failed to parse Redis message from channel ${channel}`,
          error,
          this.context,
        );
      }
    });
  }

  async handleConnection(client: Socket) {
    const { userId, organizationId } = await this.resolveClientIdentity(client);

    if (!userId) {
      this.logger.warn(
        `Client ${client.id} connected without resolvable userId`,
      );
      client.disconnect();
      return;
    }

    // Store client info
    const clientInfo: ClientInfo = {
      organizationId,
      socketId: client.id,
      userId,
    };

    this.clients.set(client.id, clientInfo);

    // Track user's sockets (user can have multiple connections)
    if (!this.userToSocket.has(userId)) {
      this.userToSocket.set(userId, new Set());
    }
    this.userToSocket.get(userId)?.add(client.id);

    // Join user-specific room
    // Room name uses getUserRoomName for consistency across cloud and self-hosted
    await client.join(getUserRoomName(userId));

    if (organizationId) {
      await client.join(`org-${organizationId}`);
    }

    this.logger.log(`Client ${client.id} connected for user ${userId}`, {
      organizationId,
      orgRoomJoined: organizationId ? `org-${organizationId}` : undefined,
      roomJoined: getUserRoomName(userId),
      userId,
    });

    // Send connection confirmation
    client.emit('connected', {
      organizationId,
      socketId: client.id,
      userId,
    });
  }

  private async resolveClientIdentity(client: Socket): Promise<{
    userId?: string;
    organizationId?: string;
  }> {
    const queryUserId = client.handshake.query.userId as string | undefined;
    const queryOrgId = client.handshake.query.organizationId as
      | string
      | undefined;

    const token = this.extractToken(client);
    if (!token) {
      return { organizationId: queryOrgId, userId: queryUserId };
    }

    try {
      const clerkSecret = this.configService.get('CLERK_SECRET_KEY');
      if (!clerkSecret) {
        this.logger.warn(
          'Missing CLERK_SECRET_KEY configuration; falling back to query parameters',
          this.context,
        );
        return { organizationId: queryOrgId, userId: queryUserId };
      }

      const tokenPayload = await verifyToken(token, {
        secretKey: clerkSecret,
      });

      const sessionClaims = resolveClerkSessionClaims(tokenPayload);
      const userIdFromToken = sessionClaims.clerkUserId;
      const organizationIdFromToken = sessionClaims.organizationId;

      return {
        organizationId: organizationIdFromToken || queryOrgId,
        userId: userIdFromToken || queryUserId,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message ?? String(error);
      this.logger.warn(
        `Failed to verify Clerk token for client ${client.id}: ${errorMessage}`,
        { ...this.context, error },
      );
      return { organizationId: queryOrgId, userId: queryUserId };
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const headerToken = client.handshake.headers.authorization;
    if (typeof headerToken === 'string') {
      return headerToken.split(' ').pop();
    }

    return undefined;
  }
  handleDisconnect(client: Socket) {
    const clientInfo = this.clients.get(client.id);

    if (clientInfo) {
      // Remove from user's socket set
      const userSockets = this.userToSocket.get(clientInfo.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userToSocket.delete(clientInfo.userId);
        }
      }

      // Remove client info
      this.clients.delete(client.id);

      this.logger.log(
        `Client ${client.id} disconnected for user ${clientInfo.userId}`,
      );
    }
  }

  private handleRedisMessage(channel: string, data: unknown) {
    switch (channel) {
      case 'agent-chat':
        this.handleAgentChat(
          data as {
            type: string;
            data: { userId: string; threadId: string };
          },
        );
        break;

      case 'video-progress':
        this.handleVideoProgress(data as VideoProgressEvent);
        break;

      case 'video-complete':
        this.handleVideoComplete(data as VideoCompleteEvent);
        break;

      case 'media-failed':
        this.handleMediaFailed(data as MediaFailedEvent);
        break;

      case 'notifications':
        this.handleNotification(data as NotificationData);
        break;

      case 'ingredient-status':
        this.handleIngredientStatus(data as IngredientStatusData);
        break;

      case 'post-status':
        this.handlePublicationStatus(data as PostStatusData);
        break;

      case 'training-status':
        this.handleTrainingStatus(data as TrainingStatusData);
        break;

      case 'file-processing':
        this.handleFileProcessing(data as FileProcessingData);
        break;

      case 'asset-status':
        this.handleAssetStatus(data as AssetStatusData);
        break;

      case 'article-status':
        this.handleArticleStatus(
          data as {
            articleId: string;
            status: string;
            userId: string;
            metadata?: unknown;
          },
        );
        break;

      case 'background-task-update':
        this.handleBackgroundTaskUpdate(data as BackgroundTaskUpdateData);
        break;

      case 'generic-events':
        this.handleGenericEvent(data as { path: string; data: unknown });
        break;

      default:
        this.logger.warn(`Unknown channel: ${channel}`);
    }
  }

  private handleAgentChat(event: {
    type: string;
    data: { userId: string; threadId: string };
  }): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('agent-chat', event);
      return;
    }

    const { type, data } = event;
    if (!data?.userId) {
      return;
    }

    this.server.to(getUserRoomName(data.userId)).emit(type, data);

    this.logger.debug(
      `Sent ${type} to ${getUserRoomName(data.userId)} for thread ${data.threadId}`,
    );
  }

  private handleVideoProgress(data: VideoProgressEvent): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('video-progress', data);
      return;
    }

    const { path, progress, userId, room } = data;
    const targetRoom = this.getTargetRoom(userId, room);

    this.server.to(targetRoom).emit(path, {
      progress,
      status: 'processing',
      timestamp: new Date().toISOString(),
    });

    // Also emit with channel name for activities dropdown subscribers
    this.server.to(targetRoom).emit('video-progress', {
      progress,
      status: 'processing',
      timestamp: new Date().toISOString(),
    });

    this.logger.debug(`Sent video progress to ${targetRoom}: ${path}`);
  }

  private handleVideoComplete(data: VideoCompleteEvent): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('video-complete', data);
      return;
    }

    const { path, result, userId, room } = data;
    const targetRoom = this.getTargetRoom(userId, room);

    const roomMembers = this.server.sockets?.adapter?.rooms?.get(targetRoom);
    this.logger.log('WebSocket handleVideoComplete - Room check', {
      allRooms: this.server.sockets?.adapter?.rooms
        ? Array.from(this.server.sockets.adapter.rooms.keys()).filter((r) =>
            r.startsWith('user-'),
          )
        : [],
      path,
      room,
      roomMembersCount: roomMembers?.size ?? 0,
      targetRoom,
      userId,
    });

    this.server.to(targetRoom).emit(path, {
      result,
      status: 'completed',
      timestamp: new Date().toISOString(),
    });

    // Also emit with channel name for activities dropdown subscribers
    this.server.to(targetRoom).emit('video-complete', {
      result,
      status: 'completed',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Sent video complete to ${targetRoom}: ${path}`);
  }

  private handleMediaFailed(data: MediaFailedEvent): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('media-failed', data);
      return;
    }

    const { path, error, userId, room } = data;
    const targetRoom = this.getTargetRoom(userId, room);

    this.server.to(targetRoom).emit(path, {
      error,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });

    // Also emit with channel name for activities dropdown subscribers
    this.server.to(targetRoom).emit('media-failed', {
      error,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });

    this.logger.error(`Sent media failed to ${targetRoom}: ${path}`, error);
  }

  private handleNotification(data: NotificationData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('notification', data);
      return;
    }

    const { userId, notification, organizationId } = data;

    if (organizationId) {
      this.server
        .to(`org-${organizationId}`)
        .emit('notification', notification);
      this.logger.log(`Sent notification to org ${organizationId}`);
    } else if (userId) {
      this.server
        .to(getUserRoomName(userId))
        .emit('notification', notification);
      this.logger.log(`Sent notification to user ${userId}`);
    }
  }

  private handleIngredientStatus(data: IngredientStatusData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('ingredient-status', data);
      return;
    }

    const { ingredientId, status, userId, metadata } = data;
    const path = `/ingredients/${ingredientId}/status`;

    this.server.to(getUserRoomName(userId)).emit(path, {
      ingredientId,
      metadata,
      status,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Sent ingredient status update for ${ingredientId} to user ${userId}`,
    );
  }

  private handlePublicationStatus(data: PostStatusData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('post-status', data);
      return;
    }

    const { postId, status, userId, metadata } = data;
    const path = `/posts/${postId}/status`;

    this.server.to(getUserRoomName(userId)).emit(path, {
      metadata,
      postId,
      status,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Sent post status update for ${postId} to user ${userId}`);
  }

  private handleTrainingStatus(data: TrainingStatusData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('training-status', data);
      return;
    }

    const { trainingId, status, userId, progress } = data;
    const path = `/trainings/${trainingId}/status`;

    this.server.to(getUserRoomName(userId)).emit(path, {
      progress,
      status,
      timestamp: new Date().toISOString(),
      trainingId,
    });

    this.logger.log(
      `Sent training status update for ${trainingId} to user ${userId}`,
    );
  }

  private handleFileProcessing(data: FileProcessingData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('file-processing', data);
      return;
    }

    const { jobId, type, status, progress, userId, ingredientId } = data;
    const path = `/files/${ingredientId}/${type}`;

    this.server.to(getUserRoomName(userId)).emit(path, {
      ingredientId,
      jobId,
      progress,
      status,
      timestamp: new Date().toISOString(),
      type,
    });

    this.logger.debug(
      `Sent file processing update for ${ingredientId} to user ${userId}`,
    );
  }

  private handleAssetStatus(data: AssetStatusData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('asset-status', data);
      return;
    }

    const { assetId, status, userId, metadata } = data;

    this.server.to(getUserRoomName(userId)).emit('asset-status', {
      assetId,
      metadata,
      status,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Sent asset status update for ${assetId} to user ${userId}: ${status}`,
    );
  }

  private handleArticleStatus(data: {
    articleId: string;
    status: string;
    userId: string;
    metadata?: unknown;
  }): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('article-status', data);
      return;
    }

    const { articleId, status, userId, metadata } = data;

    this.server.to(getUserRoomName(userId)).emit('article-status', {
      articleId,
      metadata,
      status,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Sent article status update for ${articleId} to user ${userId}: ${status}`,
    );
  }

  private handleBackgroundTaskUpdate(data: BackgroundTaskUpdateData): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('background-task-update', data);
      return;
    }

    const { userId, room } = data;
    const targetRoom = this.getTargetRoom(userId, room);

    this.server.to(targetRoom).emit('background-task-update', data);

    this.logger.debug(
      `Sent background-task-update to ${targetRoom}: ${data.status}`,
    );
  }

  private handleGenericEvent(data: { path: string; data: unknown }): void {
    if (!this.isServerOperational()) {
      this.warnServerNotReady('generic-event', data);
      return;
    }

    const { path, data: eventData } = data;
    const eventDataObj =
      eventData && typeof eventData === 'object'
        ? (eventData as Record<string, unknown>)
        : {};

    const userId = eventDataObj?.userId as string | undefined;
    const room = eventDataObj?.room as string | undefined;
    const payload = { ...eventDataObj, timestamp: new Date().toISOString() };

    if (room) {
      this.server.to(room).emit(path, payload);
      this.logger.debug(`Sent generic event to room ${room}: ${path}`);
    } else if (userId) {
      this.server.to(getUserRoomName(userId)).emit(path, payload);
      this.logger.debug(`Sent generic event to user ${userId}: ${path}`);
    } else {
      this.server.emit(path, payload);
      this.logger.warn(`Broadcast generic event to all clients: ${path}`);
    }
  }

  private async publishToApi(
    channel: string,
    data: Record<string, unknown>,
    client: Socket,
    clientInfo: ClientInfo,
  ): Promise<{ message: string; success: boolean }> {
    await this.redisService.publish(channel, {
      ...data,
      socketId: client.id,
      userId: clientInfo.userId,
    });
    return { message: 'Request sent', success: true };
  }

  @SubscribeMessage('ingredient:update')
  async handleIngredientUpdate(
    @MessageBody() data: IngredientUpdateMessage,
    @ConnectedSocket() client: Socket,
  ): Promise<{ error: string } | { message: string; success: boolean }> {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      return { error: 'Unauthorized' };
    }
    return this.publishToApi('api:ingredient:update', data, client, clientInfo);
  }

  @SubscribeMessage('post:update')
  async handlePostUpdate(
    @MessageBody() data: PostUpdateMessage,
    @ConnectedSocket() client: Socket,
  ): Promise<{ error: string } | { message: string; success: boolean }> {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      return { error: 'Unauthorized' };
    }
    return this.publishToApi('api:post:update', data, client, clientInfo);
  }

  @SubscribeMessage('vote:create')
  async handleVoteCreate(
    @MessageBody() data: VoteCreateMessage,
    @ConnectedSocket() client: Socket,
  ): Promise<{ error: string } | { message: string; success: boolean }> {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      return { error: 'Unauthorized' };
    }
    return this.publishToApi('api:vote:create', data, client, clientInfo);
  }

  @SubscribeMessage('subscription:update')
  async handleSubscriptionUpdate(
    @MessageBody() data: SubscriptionUpdateMessage,
    @ConnectedSocket() client: Socket,
  ): Promise<{ error: string } | { message: string; success: boolean }> {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      return { error: 'Unauthorized' };
    }
    await this.redisService.publish('api:subscription:update', {
      ...data,
      organizationId: clientInfo.organizationId,
      socketId: client.id,
      userId: clientInfo.userId,
    });
    return { message: 'Request sent', success: true };
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.isServerOperational()) {
      this.logger.warn('WebSocket server not ready, skipping emitToUser', {
        ...this.context,
        event,
        userId,
      });
      return;
    }
    this.server.to(getUserRoomName(userId)).emit(event, data);
  }

  emitToOrganization(
    organizationId: string,
    event: string,
    data: unknown,
  ): void {
    if (!this.isServerOperational()) {
      this.logger.warn(
        'WebSocket server not ready, skipping emitToOrganization',
        {
          ...this.context,
          event,
          organizationId,
        },
      );
      return;
    }
    this.server.to(`org-${organizationId}`).emit(event, data);
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      totalClients: this.clients.size,
      totalUsers: this.userToSocket.size,
      users: Array.from(this.userToSocket.entries()).map(
        ([userId, sockets]) => ({
          connections: sockets.size,
          userId,
        }),
      ),
    };
  }
}
