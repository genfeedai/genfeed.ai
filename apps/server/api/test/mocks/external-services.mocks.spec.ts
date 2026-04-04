/**
 * External Services Mocks Tests
 * Verifies that all mock factories return properly structured mock objects
 */

import {
  createAllExternalServiceMocks,
  createMockCacheService,
  createMockClerkClient,
  createMockClerkService,
  createMockConfigService,
  createMockElevenLabsService,
  createMockHeyGenService,
  createMockHttpService,
  createMockInstagramService,
  createMockLinkedInService,
  createMockLoggerService,
  createMockPinterestService,
  createMockPublisherFactoryService,
  createMockPublisherService,
  createMockRedditService,
  createMockReplicateService,
  createMockS3Service,
  createMockStripeService,
  createMockThreadsService,
  createMockTiktokService,
  createMockTwitterService,
  createMockYoutubeService,
} from '@api-test/mocks/external-services.mocks';
import { describe, expect, it, vi } from 'vitest';

describe('External Services Mocks', () => {
  describe('Replicate Service Mock', () => {
    it('should create a valid Replicate service mock', () => {
      const mock = createMockReplicateService();

      expect(mock).toHaveProperty('runModel');
      expect(mock).toHaveProperty('getPrediction');
      expect(mock).toHaveProperty('generateImageToVideo');
      expect(mock).toHaveProperty('generateTextToVideo');
      expect(mock).toHaveProperty('generateTextToImage');
      expect(mock).toHaveProperty('generateEmbedding');
    });

    it('should return prediction ID for model runs', async () => {
      const mock = createMockReplicateService();
      const result = await mock.runModel('version', { input: 'test' });

      expect(typeof result).toBe('string');
      expect(result).toContain('mock-replicate');
    });

    it('should return embedding array', async () => {
      const mock = createMockReplicateService();
      const result = await mock.generateEmbedding('test text');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(512);
    });
  });

  describe('ElevenLabs Service Mock', () => {
    it('should create a valid ElevenLabs service mock', () => {
      const mock = createMockElevenLabsService();

      expect(mock).toHaveProperty('textToSpeech');
      expect(mock).toHaveProperty('getVoices');
      expect(mock).toHaveProperty('getVoice');
    });

    it('should return audio buffer for text-to-speech', async () => {
      const mock = createMockElevenLabsService();
      const result = await mock.textToSpeech('test text');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should return voices list', async () => {
      const mock = createMockElevenLabsService();
      const voices = await mock.getVoices();

      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0]).toHaveProperty('voice_id');
    });
  });

  describe('HeyGen Service Mock', () => {
    it('should create a valid HeyGen service mock', () => {
      const mock = createMockHeyGenService();

      expect(mock).toHaveProperty('createVideo');
      expect(mock).toHaveProperty('getVideoStatus');
      expect(mock).toHaveProperty('getAvatars');
    });

    it('should return video creation result', async () => {
      const mock = createMockHeyGenService();
      const result = await mock.createVideo({});

      expect(result).toHaveProperty('video_id');
      expect(result).toHaveProperty('status');
    });
  });

  describe('Stripe Service Mock', () => {
    it('should create a valid Stripe service mock', () => {
      const mock = createMockStripeService();

      expect(mock).toHaveProperty('stripe');
      expect(mock).toHaveProperty('createOrganizationCustomer');
      expect(mock).toHaveProperty('createPaymentSession');
      expect(mock).toHaveProperty('cancelSubscription');
    });

    it('should have nested stripe client methods', () => {
      const mock = createMockStripeService();

      expect(mock.stripe).toHaveProperty('customers');
      expect(mock.stripe).toHaveProperty('subscriptions');
      expect(mock.stripe).toHaveProperty('paymentIntents');
      expect(mock.stripe).toHaveProperty('checkout');
    });

    it('should return customer on create', async () => {
      const mock = createMockStripeService();
      const customer = await mock.stripe.customers.create({
        email: 'test@test.com',
      });

      expect(customer).toHaveProperty('id');
      expect(customer.id).toContain('cus_mock');
    });
  });

  describe('Social Media Service Mocks', () => {
    it('should create valid YouTube service mock', () => {
      const mock = createMockYoutubeService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('exchangeToken');
      expect(mock).toHaveProperty('uploadVideo');
      expect(mock).toHaveProperty('getChannelInfo');
    });

    it('should create valid TikTok service mock', () => {
      const mock = createMockTiktokService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('exchangeToken');
      expect(mock).toHaveProperty('uploadVideo');
    });

    it('should create valid Instagram service mock', () => {
      const mock = createMockInstagramService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('exchangeToken');
      expect(mock).toHaveProperty('publishMedia');
    });

    it('should create valid Twitter service mock', () => {
      const mock = createMockTwitterService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('postTweet');
      expect(mock).toHaveProperty('uploadMedia');
    });

    it('should create valid LinkedIn service mock', () => {
      const mock = createMockLinkedInService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('createPost');
    });

    it('should create valid Threads service mock', () => {
      const mock = createMockThreadsService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('createPost');
    });

    it('should create valid Pinterest service mock', () => {
      const mock = createMockPinterestService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('createPin');
    });

    it('should create valid Reddit service mock', () => {
      const mock = createMockRedditService();

      expect(mock).toHaveProperty('getAuthUrl');
      expect(mock).toHaveProperty('createPost');
    });
  });

  describe('Clerk Service Mocks', () => {
    it('should create valid Clerk client mock', () => {
      const mock = createMockClerkClient();

      expect(mock).toHaveProperty('users');
      expect(mock).toHaveProperty('invitations');
      expect(mock).toHaveProperty('sessions');
    });

    it('should return user on getUser', async () => {
      const mock = createMockClerkClient();
      const user = await mock.users.getUser('user_id');

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('emailAddresses');
      expect(user).toHaveProperty('publicMetadata');
    });

    it('should create valid Clerk service mock', () => {
      const mock = createMockClerkService();

      expect(mock).toHaveProperty('getUser');
      expect(mock).toHaveProperty('updateUser');
      expect(mock).toHaveProperty('updateUserPublicMetadata');
      expect(mock).toHaveProperty('createInvitation');
    });
  });

  describe('S3 Service Mock', () => {
    it('should create valid S3 service mock', () => {
      const mock = createMockS3Service();

      expect(mock).toHaveProperty('upload');
      expect(mock).toHaveProperty('getSignedUrl');
      expect(mock).toHaveProperty('deleteObject');
      expect(mock).toHaveProperty('headObject');
    });

    it('should return upload result', async () => {
      const mock = createMockS3Service();
      const result = await mock.upload({});

      expect(result).toHaveProperty('Location');
      expect(result).toHaveProperty('Key');
    });
  });

  describe('Cache Service Mock', () => {
    it('should create valid cache service mock', () => {
      const mock = createMockCacheService();

      expect(mock).toHaveProperty('get');
      expect(mock).toHaveProperty('set');
      expect(mock).toHaveProperty('exists');
      expect(mock).toHaveProperty('clear');
      expect(mock).toHaveProperty('generateKey');
    });

    it('should generate cache key from arguments', () => {
      const mock = createMockCacheService();
      const key = mock.generateKey('prefix', 'resource', 'id');

      expect(key).toBe('prefix:resource:id');
    });
  });

  describe('Logger Service Mock', () => {
    it('should create valid logger service mock', () => {
      const mock = createMockLoggerService();

      expect(mock).toHaveProperty('log');
      expect(mock).toHaveProperty('error');
      expect(mock).toHaveProperty('warn');
      expect(mock).toHaveProperty('debug');
      expect(mock).toHaveProperty('verbose');
    });

    it('should be callable without throwing', () => {
      const mock = createMockLoggerService();

      expect(() => mock.log('test')).not.toThrow();
      expect(() => mock.error('test')).not.toThrow();
      expect(() => mock.warn('test')).not.toThrow();
    });
  });

  describe('Config Service Mock', () => {
    it('should create valid config service mock with defaults', () => {
      const mock = createMockConfigService();

      expect(mock).toHaveProperty('get');
      expect(mock).toHaveProperty('getNumber');
    });

    it('should return default values', () => {
      const mock = createMockConfigService();

      expect(mock.get('NODE_ENV')).toBe('test');
      expect(mock.get('PORT')).toBe(3001);
      expect(mock.get('JWT_SECRET')).toBe('test-jwt-secret');
    });

    it('should allow custom config overrides', () => {
      const mock = createMockConfigService({ CUSTOM_KEY: 'custom_value' });

      expect(mock.get('CUSTOM_KEY')).toBe('custom_value');
    });
  });

  describe('HTTP Service Mock', () => {
    it('should create valid HTTP service mock', () => {
      const mock = createMockHttpService();

      expect(mock).toHaveProperty('get');
      expect(mock).toHaveProperty('post');
      expect(mock).toHaveProperty('put');
      expect(mock).toHaveProperty('patch');
      expect(mock).toHaveProperty('delete');
      expect(mock).toHaveProperty('axiosRef');
    });
  });

  describe('Publisher Service Mocks', () => {
    it('should create valid publisher service mock', () => {
      const mock = createMockPublisherService();

      expect(mock).toHaveProperty('publish');
      expect(mock).toHaveProperty('validateCredentials');
      expect(mock).toHaveProperty('getAccountInfo');
    });

    it('should create valid publisher factory mock', () => {
      const mock = createMockPublisherFactoryService();

      expect(mock).toHaveProperty('getPublisher');
      expect(mock).toHaveProperty('getSupportedPlatforms');
    });

    it('should return supported platforms', () => {
      const mock = createMockPublisherFactoryService();
      const platforms = mock.getSupportedPlatforms();

      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms).toContain('youtube');
      expect(platforms).toContain('tiktok');
    });
  });

  describe('createAllExternalServiceMocks', () => {
    it('should create all service mocks at once', () => {
      const mocks = createAllExternalServiceMocks();

      expect(mocks).toHaveProperty('replicateService');
      expect(mocks).toHaveProperty('stripeService');
      expect(mocks).toHaveProperty('clerkService');
      expect(mocks).toHaveProperty('youtubeService');
      expect(mocks).toHaveProperty('tiktokService');
      expect(mocks).toHaveProperty('cacheService');
      expect(mocks).toHaveProperty('loggerService');
      expect(mocks).toHaveProperty('configService');
    });

    it('should return unique mock instances', () => {
      const mocks1 = createAllExternalServiceMocks();
      const mocks2 = createAllExternalServiceMocks();

      // Each call should create new mock instances
      expect(mocks1.replicateService).not.toBe(mocks2.replicateService);
    });
  });

  describe('Mock Function Calls', () => {
    it('should track mock function calls', async () => {
      const mock = createMockReplicateService();

      await mock.runModel('version', { input: 'test' });
      await mock.runModel('version', { input: 'test2' });

      expect(mock.runModel).toHaveBeenCalledTimes(2);
    });

    it('should allow overriding mock return values', async () => {
      const mock = createMockReplicateService();

      // Override the mock implementation
      mock.generateTextCompletionSync = vi
        .fn()
        .mockResolvedValue('Custom response');

      const result = await mock.generateTextCompletionSync({});

      expect(result).toBe('Custom response');
    });

    it('should allow mocking errors', async () => {
      const mock = createMockStripeService();

      // Override to throw error
      mock.createOrganizationCustomer = vi
        .fn()
        .mockRejectedValue(new Error('Stripe API error'));

      await expect(
        mock.createOrganizationCustomer('org', 'email', 'orgId', 'userId'),
      ).rejects.toThrow('Stripe API error');
    });
  });
});
