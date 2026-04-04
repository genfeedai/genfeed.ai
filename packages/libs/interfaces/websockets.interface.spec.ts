import {
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
  WebSocketUpdateMessage,
} from '@libs/interfaces/websockets.interface';

describe('WebsocketsInterface', () => {
  describe('ClientInfo', () => {
    it('should have required client info properties', () => {
      const clientInfo: ClientInfo = {
        organizationId: 'org_456',
        socketId: 'socket_789',
        userId: 'user_123',
      };

      expect(clientInfo.userId).toBe('user_123');
      expect(clientInfo.organizationId).toBe('org_456');
      expect(clientInfo.socketId).toBe('socket_789');
    });

    it('should allow organizationId to be undefined', () => {
      const clientInfo: ClientInfo = {
        socketId: 'socket_789',
        userId: 'user_123',
      };

      expect(clientInfo.organizationId).toBeUndefined();
    });
  });

  describe('VideoProgressEvent', () => {
    it('should have required video progress properties', () => {
      const event: VideoProgressEvent = {
        path: '/videos/video_123',
        progress: 50,
        room: 'room_456',
        userId: 'user_123',
      };

      expect(event.path).toBe('/videos/video_123');
      expect(event.progress).toBe(50);
      expect(event.userId).toBe('user_123');
      expect(event.room).toBe('room_456');
    });

    it('should allow room to be undefined', () => {
      const event: VideoProgressEvent = {
        path: '/videos/video_123',
        progress: 50,
        userId: 'user_123',
      };

      expect(event.room).toBeUndefined();
    });
  });

  describe('VideoCompleteEvent', () => {
    it('should have required video complete properties', () => {
      const event: VideoCompleteEvent = {
        path: '/videos/video_123',
        result: { url: 'https://example.com/video.mp4' },
        room: 'room_456',
        userId: 'user_123',
      };

      expect(event.path).toBe('/videos/video_123');
      expect(event.result).toEqual({ url: 'https://example.com/video.mp4' });
      expect(event.userId).toBe('user_123');
      expect(event.room).toBe('room_456');
    });
  });

  describe('MediaFailedEvent', () => {
    it('should have required media failed properties', () => {
      const event: MediaFailedEvent = {
        error: { message: 'Processing failed' },
        path: '/images/image_123',
        room: 'room_456',
        userId: 'user_123',
      };

      expect(event.path).toBe('/images/image_123');
      expect(event.error).toEqual({ message: 'Processing failed' });
      expect(event.userId).toBe('user_123');
      expect(event.room).toBe('room_456');
    });
  });

  describe('NotificationData', () => {
    it('should have notification data properties', () => {
      const data: NotificationData = {
        notification: { body: 'Test body', title: 'Test' },
        organizationId: 'org_456',
        userId: 'user_123',
      };

      expect(data.userId).toBe('user_123');
      expect(data.notification).toEqual({ body: 'Test body', title: 'Test' });
      expect(data.organizationId).toBe('org_456');
    });

    it('should allow userId and organizationId to be undefined', () => {
      const data: NotificationData = {
        notification: { title: 'Test' },
      };

      expect(data.userId).toBeUndefined();
      expect(data.organizationId).toBeUndefined();
    });
  });

  describe('IngredientStatusData', () => {
    it('should have required ingredient status properties', () => {
      const data: IngredientStatusData = {
        ingredientId: 'ing_123',
        metadata: { progress: 50 },
        status: 'processing',
        userId: 'user_123',
      };

      expect(data.ingredientId).toBe('ing_123');
      expect(data.status).toBe('processing');
      expect(data.userId).toBe('user_123');
      expect(data.metadata).toEqual({ progress: 50 });
    });

    it('should allow metadata to be undefined', () => {
      const data: IngredientStatusData = {
        ingredientId: 'ing_123',
        status: 'completed',
        userId: 'user_123',
      };

      expect(data.metadata).toBeUndefined();
    });
  });

  describe('PostStatusData', () => {
    it('should have required post status properties', () => {
      const data: PostStatusData = {
        metadata: { platform: 'twitter' },
        postId: 'post_123',
        status: 'published',
        userId: 'user_123',
      };

      expect(data.postId).toBe('post_123');
      expect(data.status).toBe('published');
      expect(data.userId).toBe('user_123');
      expect(data.metadata).toEqual({ platform: 'twitter' });
    });
  });

  describe('TrainingStatusData', () => {
    it('should have required training status properties', () => {
      const data: TrainingStatusData = {
        progress: 75,
        status: 'in_progress',
        trainingId: 'train_123',
        userId: 'user_123',
      };

      expect(data.trainingId).toBe('train_123');
      expect(data.status).toBe('in_progress');
      expect(data.userId).toBe('user_123');
      expect(data.progress).toBe(75);
    });

    it('should allow progress to be undefined', () => {
      const data: TrainingStatusData = {
        status: 'completed',
        trainingId: 'train_123',
        userId: 'user_123',
      };

      expect(data.progress).toBeUndefined();
    });
  });

  describe('FileProcessingData', () => {
    it('should have required file processing properties', () => {
      const data: FileProcessingData = {
        ingredientId: 'ing_456',
        jobId: 'job_123',
        progress: 50,
        status: 'processing',
        type: 'image',
        userId: 'user_123',
      };

      expect(data.jobId).toBe('job_123');
      expect(data.type).toBe('image');
      expect(data.status).toBe('processing');
      expect(data.progress).toBe(50);
      expect(data.userId).toBe('user_123');
      expect(data.ingredientId).toBe('ing_456');
    });

    it('should allow progress to be undefined', () => {
      const data: FileProcessingData = {
        ingredientId: 'ing_456',
        jobId: 'job_123',
        status: 'completed',
        type: 'image',
        userId: 'user_123',
      };

      expect(data.progress).toBeUndefined();
    });
  });

  describe('ConnectionStatus', () => {
    it('should have required connection status properties', () => {
      const status: ConnectionStatus = {
        totalClients: 10,
        totalUsers: 5,
        users: [
          { connections: 2, userId: 'user_1' },
          { connections: 3, userId: 'user_2' },
        ],
      };

      expect(status.totalClients).toBe(10);
      expect(status.totalUsers).toBe(5);
      expect(status.users).toHaveLength(2);
      expect(status.users[0]).toEqual({ connections: 2, userId: 'user_1' });
    });
  });

  describe('WebSocketUpdateMessage', () => {
    it('should allow flexible message structure', () => {
      const message: WebSocketUpdateMessage = {
        added: true,
        any: 'property',
        can: 'be',
      };

      expect(message.any).toBe('property');
      expect(message.can).toBe('be');
      expect(message.added).toBe(true);
    });
  });

  describe('IngredientUpdateMessage', () => {
    it('should extend WebSocketUpdateMessage with ingredientId', () => {
      const message: IngredientUpdateMessage = {
        customField: 'value',
        ingredientId: 'ing_123',
      };

      expect(message.ingredientId).toBe('ing_123');
      expect(message.customField).toBe('value');
    });
  });

  describe('PostUpdateMessage', () => {
    it('should extend WebSocketUpdateMessage with postId', () => {
      const message: PostUpdateMessage = {
        customField: 'value',
        postId: 'post_123',
      };

      expect(message.postId).toBe('post_123');
      expect(message.customField).toBe('value');
    });
  });

  describe('VoteCreateMessage', () => {
    it('should extend WebSocketUpdateMessage with vote properties', () => {
      const message: VoteCreateMessage = {
        customField: 'value',
        targetId: 'target_123',
        voteType: 'upvote',
      };

      expect(message.voteType).toBe('upvote');
      expect(message.targetId).toBe('target_123');
      expect(message.customField).toBe('value');
    });
  });

  describe('SubscriptionUpdateMessage', () => {
    it('should extend WebSocketUpdateMessage with subscription properties', () => {
      const message: SubscriptionUpdateMessage = {
        action: 'update',
        customField: 'value',
        subscriptionId: 'sub_123',
      };

      expect(message.subscriptionId).toBe('sub_123');
      expect(message.action).toBe('update');
      expect(message.customField).toBe('value');
    });
  });
});
