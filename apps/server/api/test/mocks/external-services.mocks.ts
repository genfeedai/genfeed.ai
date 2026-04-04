/**
 * External Services Mocks
 * CRITICAL: All external services MUST be mocked to avoid real API calls and costs.
 * This file provides comprehensive mocks for all AI/external service integrations.
 */

import { Types } from 'mongoose';
import { vi } from 'vitest';

// ============================================================================
// Replicate Service Mocks (Video/Image Generation)
// ============================================================================

export const createMockReplicateService = () => ({
  enhanceVideo: vi.fn().mockResolvedValue('mock-enhance-prediction-id'),
  generateEmbedding: vi.fn().mockResolvedValue(Array(512).fill(0.1)),
  generateImageToVideo: vi.fn().mockResolvedValue('mock-i2v-prediction-id'),
  generateTextCompletion: vi.fn().mockResolvedValue('mock-text-completion-id'),
  generateTextCompletionSync: vi
    .fn()
    .mockResolvedValue('Mocked text completion response'),
  generateTextToImage: vi.fn().mockResolvedValue('mock-t2i-prediction-id'),
  generateTextToVideo: vi.fn().mockResolvedValue('mock-t2v-prediction-id'),
  getAspectRatio: vi.fn().mockReturnValue('16:9'),
  getPrediction: vi.fn().mockResolvedValue({
    id: 'mock-prediction-id',
    output: 'https://mock-replicate-output.com/result.mp4',
    status: 'succeeded',
  }),
  runModel: vi.fn().mockResolvedValue('mock-replicate-prediction-id'),
  runTraining: vi.fn().mockResolvedValue('mock-training-id'),
  transcribeAudio: vi.fn().mockResolvedValue({
    duration: 5,
    language: 'en',
    segments: [{ end: 5, start: 0, text: 'Mocked transcription text' }],
    text: 'Mocked transcription text',
  }),
});

// ============================================================================
// ElevenLabs Service Mocks (Text-to-Speech)
// ============================================================================

export const createMockElevenLabsService = () => ({
  cloneVoice: vi.fn().mockResolvedValue({
    name: 'Cloned Voice',
    voice_id: 'mock-cloned-voice-id',
  }),
  deleteVoice: vi.fn().mockResolvedValue({ success: true }),
  getVoice: vi.fn().mockResolvedValue({
    labels: { accent: 'american' },
    name: 'Test Voice',
    voice_id: 'mock-voice-1',
  }),
  getVoices: vi.fn().mockResolvedValue([
    {
      labels: { accent: 'american' },
      name: 'Test Voice 1',
      voice_id: 'mock-voice-1',
    },
    {
      labels: { accent: 'british' },
      name: 'Test Voice 2',
      voice_id: 'mock-voice-2',
    },
  ]),
  textToSpeech: vi.fn().mockResolvedValue(Buffer.from('mock-audio-data')),
});

// ============================================================================
// HeyGen Service Mocks (Avatar Video Generation)
// ============================================================================

export const createMockHeyGenService = () => ({
  createVideo: vi.fn().mockResolvedValue({
    status: 'processing',
    video_id: 'mock-heygen-video-id',
  }),
  getAvatars: vi.fn().mockResolvedValue([
    { avatar_id: 'mock-avatar-1', avatar_name: 'Test Avatar 1' },
    { avatar_id: 'mock-avatar-2', avatar_name: 'Test Avatar 2' },
  ]),
  getVideoStatus: vi.fn().mockResolvedValue({
    status: 'completed',
    video_url: 'https://mock-heygen.com/video.mp4',
  }),
  getVoices: vi
    .fn()
    .mockResolvedValue([
      { language: 'en', name: 'Test Voice', voice_id: 'mock-heygen-voice-1' },
    ]),
});

// ============================================================================
// Hedra Service Mocks (AI Avatar)
// ============================================================================

export const createMockHedraService = () => ({
  createCharacter: vi.fn().mockResolvedValue({
    character_id: 'mock-hedra-character-id',
    status: 'created',
  }),
  generateVideo: vi.fn().mockResolvedValue({
    status: 'processing',
    video_id: 'mock-hedra-video-id',
  }),
  getVideoStatus: vi.fn().mockResolvedValue({
    status: 'completed',
    video_url: 'https://mock-hedra.com/video.mp4',
  }),
});

// ============================================================================
// Opus Pro Service Mocks (Template Video Generation)
// ============================================================================

export const createMockOpusProService = () => ({
  generateVideo: vi.fn().mockResolvedValue('mock-opuspro-video-id'),
  getAccountInfo: vi.fn().mockResolvedValue({
    credits: 100,
    email: 'test@example.com',
    plan: 'pro',
  }),
  getTemplates: vi.fn().mockResolvedValue([
    {
      description: 'A template for social media clips',
      name: 'Social Clip Template',
      preview: 'https://mock-opuspro.com/preview-1.jpg',
      templateId: 'mock-template-1',
    },
    {
      description: 'A template for product demos',
      name: 'Product Demo Template',
      preview: 'https://mock-opuspro.com/preview-2.jpg',
      templateId: 'mock-template-2',
    },
  ]),
  getVideoStatus: vi.fn().mockResolvedValue({
    progress: 100,
    status: 'completed',
    videoUrl: 'https://mock-opuspro.com/video.mp4',
  }),
});

// ============================================================================
// KlingAI Service Mocks (Video Generation)
// ============================================================================

export const createMockKlingAIService = () => ({
  generateImage: vi.fn().mockResolvedValue({
    status: 'processing',
    task_id: 'mock-kling-image-task-id',
  }),
  generateVideo: vi.fn().mockResolvedValue({
    status: 'processing',
    task_id: 'mock-kling-task-id',
  }),
  getTaskStatus: vi.fn().mockResolvedValue({
    status: 'completed',
    video_url: 'https://mock-kling.com/video.mp4',
  }),
});

// ============================================================================
// LeonardoAI Service Mocks (Image Generation)
// ============================================================================

export const createMockLeonardoAIService = () => ({
  generateImage: vi.fn().mockResolvedValue({
    generationId: 'mock-leonardo-id',
    status: 'PENDING',
  }),
  getGeneration: vi.fn().mockResolvedValue({
    generated_images: [
      { id: 'mock-image-id', url: 'https://mock-leonardo.com/image.png' },
    ],
    status: 'COMPLETE',
  }),
  getModels: vi.fn().mockResolvedValue([
    { id: 'mock-model-1', name: 'Leonardo Model 1' },
    { id: 'mock-model-2', name: 'Leonardo Model 2' },
  ]),
});

// ============================================================================
// Stripe Service Mocks (Payment Processing)
// ============================================================================

export const createMockStripeService = () => ({
  cancelSubscription: vi.fn().mockResolvedValue({
    cancel_at_period_end: true,
    id: 'sub_mock',
    status: 'canceled',
  }),
  changeSubscriptionPlan: vi.fn().mockResolvedValue({
    id: 'sub_mock',
    status: 'active',
  }),
  createOrganizationCustomer: vi.fn().mockResolvedValue({ id: 'cus_org_mock' }),
  createPaymentSession: vi.fn().mockResolvedValue({
    id: 'cs_mock',
    url: 'https://checkout.stripe.com/mock',
  }),
  createUserCustomer: vi.fn().mockResolvedValue({ id: 'cus_user_mock' }),
  createUserPaymentSession: vi.fn().mockResolvedValue({
    id: 'cs_user_mock',
    url: 'https://checkout.stripe.com/mock',
  }),
  getBillingPortalUrl: vi.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/mock',
  }),
  getPrice: vi.fn().mockResolvedValue({
    currency: 'usd',
    id: 'price_mock',
    unit_amount: 1000,
  }),
  getSubscription: vi.fn().mockResolvedValue({
    id: 'sub_mock',
    items: { data: [{ price: { id: 'price_mock' } }] },
    status: 'active',
  }),
  getUpcomingInvoice: vi.fn().mockResolvedValue({
    amount_due: 0,
    currency: 'usd',
    lines: { data: [] },
  }),
  getUserBillingPortalUrl: vi.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/mock',
  }),
  retrieveCustomer: vi
    .fn()
    .mockResolvedValue({ email: 'test@test.com', id: 'cus_mock123' }),
  stripe: {
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/mock',
        }),
      },
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_mock123',
          url: 'https://checkout.stripe.com/mock',
        }),
      },
    },
    customers: {
      create: vi
        .fn()
        .mockResolvedValue({ email: 'test@test.com', id: 'cus_mock123' }),
      retrieve: vi.fn().mockResolvedValue({
        deleted: false,
        email: 'test@test.com',
        id: 'cus_mock123',
      }),
      update: vi
        .fn()
        .mockResolvedValue({ email: 'test@test.com', id: 'cus_mock123' }),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    paymentIntents: {
      create: vi
        .fn()
        .mockResolvedValue({ client_secret: 'secret_mock', id: 'pi_mock123' }),
      retrieve: vi
        .fn()
        .mockResolvedValue({ id: 'pi_mock123', status: 'succeeded' }),
    },
    prices: {
      retrieve: vi.fn().mockResolvedValue({
        currency: 'usd',
        id: 'price_mock123',
        product: { id: 'prod_mock', name: 'Test Product' },
        recurring: null,
        unit_amount: 1000,
      }),
    },
    subscriptions: {
      cancel: vi
        .fn()
        .mockResolvedValue({ id: 'sub_mock123', status: 'canceled' }),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'sub_mock123', status: 'active' }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_mock123',
        items: { data: [{ id: 'si_mock', price: { id: 'price_mock' } }] },
        status: 'active',
      }),
      update: vi
        .fn()
        .mockResolvedValue({ id: 'sub_mock123', status: 'active' }),
    },
  },
});

// ============================================================================
// Social Media OAuth Service Mocks
// ============================================================================

export const createMockYoutubeService = () => ({
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-yt-access-token',
    expires_in: 3600,
    refresh_token: 'mock-yt-refresh-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-youtube-auth.com/oauth'),
  getChannelInfo: vi.fn().mockResolvedValue({
    id: 'mock-channel-id',
    snippet: { customUrl: '@testchannel', title: 'Test Channel' },
    statistics: { subscriberCount: '1000', viewCount: '10000' },
  }),
  getVideoAnalytics: vi.fn().mockResolvedValue({
    comments: 50,
    likes: 100,
    views: 1000,
  }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'mock-yt-new-access-token',
    expires_in: 3600,
  }),
  uploadVideo: vi.fn().mockResolvedValue({
    id: 'mock-yt-video-id',
    snippet: { description: 'Test Description', title: 'Test Video' },
    status: { privacyStatus: 'public', uploadStatus: 'uploaded' },
  }),
});

export const createMockTiktokService = () => ({
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-tt-access-token',
    expires_in: 86400,
    open_id: 'mock-open-id',
    refresh_token: 'mock-tt-refresh-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-tiktok-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    avatar_url: 'https://mock-avatar.com/avatar.jpg',
    display_name: 'Test User',
    open_id: 'mock-open-id',
  }),
  getVideoStatus: vi.fn().mockResolvedValue({
    share_url: 'https://tiktok.com/@user/video/123',
    status: 'published',
  }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'mock-tt-new-access-token',
    expires_in: 86400,
  }),
  uploadVideo: vi.fn().mockResolvedValue({
    publish_id: 'mock-tt-publish-id',
    upload_url: 'https://mock-tiktok-upload.com',
  }),
});

export const createMockInstagramService = () => ({
  createMediaContainer: vi.fn().mockResolvedValue({
    id: 'mock-container-id',
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-ig-access-token',
    user_id: 'mock-ig-user-id',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-ig-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    account_type: 'BUSINESS',
    id: 'mock-ig-user-id',
    username: 'testuser',
  }),
  publishMedia: vi.fn().mockResolvedValue({
    id: 'mock-ig-media-id',
    permalink: 'https://instagram.com/p/mock123',
  }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'mock-ig-new-access-token',
    expires_in: 5184000,
  }),
});

export const createMockTwitterService = () => ({
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-tw-access-token',
    refresh_token: 'mock-tw-refresh-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-twitter-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    data: {
      id: 'mock-tw-user-id',
      name: 'Test User',
      username: 'testuser',
    },
  }),
  postTweet: vi.fn().mockResolvedValue({
    data: { id: 'mock-tweet-id', text: 'Test tweet' },
  }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'mock-tw-new-access-token',
  }),
  uploadMedia: vi.fn().mockResolvedValue({
    media_id_string: 'mock-media-id',
  }),
});

export const createMockLinkedInService = () => ({
  createPost: vi.fn().mockResolvedValue({
    id: 'mock-li-post-id',
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-li-access-token',
    expires_in: 5184000,
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-linkedin-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    id: 'mock-li-user-id',
    localizedFirstName: 'Test',
    localizedLastName: 'User',
  }),
  refreshToken: vi.fn().mockResolvedValue({
    access_token: 'mock-li-new-access-token',
  }),
  uploadImage: vi.fn().mockResolvedValue({
    asset: 'urn:li:digitalmediaAsset:mock-asset-id',
  }),
});

export const createMockThreadsService = () => ({
  createPost: vi.fn().mockResolvedValue({
    id: 'mock-threads-post-id',
    permalink: 'https://threads.net/@user/post/123',
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-threads-access-token',
    user_id: 'mock-threads-user-id',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-threads-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    id: 'mock-threads-user-id',
    username: 'testuser',
  }),
});

export const createMockPinterestService = () => ({
  createPin: vi.fn().mockResolvedValue({
    id: 'mock-pin-id',
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-pinterest-access-token',
    refresh_token: 'mock-pinterest-refresh-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-pinterest-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    id: 'mock-pinterest-user-id',
    username: 'testuser',
  }),
});

export const createMockRedditService = () => ({
  createPost: vi.fn().mockResolvedValue({
    data: { id: 'mock-reddit-post-id', url: 'https://reddit.com/r/test/123' },
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-reddit-access-token',
    refresh_token: 'mock-reddit-refresh-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-reddit-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    id: 'mock-reddit-user-id',
    name: 'testuser',
  }),
});

export const createMockDiscordService = () => ({
  sendMessage: vi.fn().mockResolvedValue({
    id: 'mock-discord-message-id',
  }),
  sendWebhook: vi.fn().mockResolvedValue({ success: true }),
});

export const createMockTelegramService = () => ({
  sendMessage: vi.fn().mockResolvedValue({
    chat: { id: 'mock-chat-id' },
    message_id: 123,
  }),
  sendVideo: vi.fn().mockResolvedValue({
    message_id: 124,
    video: { file_id: 'mock-file-id' },
  }),
});

export const createMockMediumService = () => ({
  createPost: vi.fn().mockResolvedValue({
    id: 'mock-medium-post-id',
    url: 'https://medium.com/@user/post-123',
  }),
  exchangeToken: vi.fn().mockResolvedValue({
    access_token: 'mock-medium-access-token',
  }),
  getAuthUrl: vi.fn().mockReturnValue('https://mock-medium-auth.com/oauth'),
  getUserInfo: vi.fn().mockResolvedValue({
    id: 'mock-medium-user-id',
    username: 'testuser',
  }),
});

// ============================================================================
// AWS S3 Service Mocks
// ============================================================================

export const createMockS3Service = () => ({
  copyObject: vi
    .fn()
    .mockResolvedValue({ CopyObjectResult: { ETag: '"mock-etag"' } }),
  deleteObject: vi.fn().mockResolvedValue({}),
  getSignedUrl: vi
    .fn()
    .mockReturnValue('https://mock-presigned-url.amazonaws.com/file.mp4'),
  headObject: vi.fn().mockResolvedValue({
    ContentLength: 1024000,
    ContentType: 'video/mp4',
    LastModified: new Date(),
  }),
  listObjects: vi.fn().mockResolvedValue({
    Contents: [
      { Key: 'file1.mp4', Size: 1024 },
      { Key: 'file2.mp4', Size: 2048 },
    ],
  }),
  upload: vi.fn().mockResolvedValue({
    ETag: '"mock-etag"',
    Key: 'bucket/file.mp4',
    Location: 'https://mock-s3.amazonaws.com/bucket/file.mp4',
  }),
});

// ============================================================================
// Clerk Service Mocks (Authentication)
// ============================================================================

export const createMockClerkClient = () => ({
  invitations: {
    createInvitation: vi.fn().mockResolvedValue({
      emailAddress: 'invite@example.com',
      id: 'mock-invitation-id',
    }),
    revokeInvitation: vi.fn().mockResolvedValue({}),
  },
  sessions: {
    getSessionList: vi.fn().mockResolvedValue({ data: [] }),
    revokeSession: vi.fn().mockResolvedValue({}),
  },
  users: {
    createUser: vi.fn().mockResolvedValue({ id: 'new-clerk-user-id' }),
    deleteUser: vi.fn().mockResolvedValue({}),
    getUser: vi.fn().mockResolvedValue({
      emailAddresses: [{ emailAddress: 'test@example.com' }],
      firstName: 'Test',
      id: 'clerk-user-id',
      lastName: 'User',
      privateMetadata: {},
      publicMetadata: {
        email: 'test@example.com',
        isOwner: true,
        isSuperAdmin: false,
        organization: new Types.ObjectId().toString(),
        user: new Types.ObjectId().toString(),
      },
    }),
    getUserList: vi.fn().mockResolvedValue({ data: [] }),
    updateUser: vi.fn().mockResolvedValue({}),
    updateUserMetadata: vi.fn().mockResolvedValue({}),
  },
});

export const createMockClerkService = () => ({
  createInvitation: vi.fn().mockResolvedValue({
    emailAddress: 'invite@example.com',
    id: 'mock-invitation-id',
  }),
  getUser: vi.fn().mockResolvedValue({
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    firstName: 'Test',
    id: 'clerk-user-id',
    lastName: 'User',
    publicMetadata: {
      email: 'test@example.com',
      isOwner: true,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    },
  }),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue({}),
  updateUserPrivateMetadata: vi.fn().mockResolvedValue({}),
  updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
});

// ============================================================================
// Giphy Service Mocks
// ============================================================================

export const createMockGiphyService = () => ({
  search: vi.fn().mockResolvedValue([
    {
      id: 'mock-gif-1',
      images: { original: { url: 'https://media.giphy.com/mock-1.gif' } },
      url: 'https://giphy.com/gifs/mock-1',
    },
  ]),
  trending: vi.fn().mockResolvedValue([
    {
      id: 'mock-gif-2',
      images: { original: { url: 'https://media.giphy.com/mock-2.gif' } },
      url: 'https://giphy.com/gifs/mock-2',
    },
  ]),
});

// ============================================================================
// News Service Mocks
// ============================================================================

export const createMockNewsService = () => ({
  getTrendingTopics: vi.fn().mockResolvedValue(['topic1', 'topic2', 'topic3']),
  searchNews: vi.fn().mockResolvedValue([
    {
      description: 'Mock news description',
      publishedAt: new Date().toISOString(),
      title: 'Mock News Article',
      url: 'https://news.example.com/article',
    },
  ]),
});

// ============================================================================
// Apify Service Mocks (Web Scraping)
// ============================================================================

export const createMockApifyService = () => ({
  getActorRuns: vi.fn().mockResolvedValue([]),
  getRunOutput: vi
    .fn()
    .mockResolvedValue([
      { content: 'Page 1 content', url: 'https://example.com/page1' },
    ]),
  runActor: vi.fn().mockResolvedValue({
    id: 'mock-run-id',
    status: 'SUCCEEDED',
  }),
});

// ============================================================================
// xAI Service Mocks
// ============================================================================

export const createMockXAIService = () => ({
  chat: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mocked xAI response' } }],
  }),
  generateImage: vi.fn().mockResolvedValue({
    url: 'https://mock-xai-image.com/image.png',
  }),
});

// ============================================================================
// Solana Service Mocks (Blockchain)
// ============================================================================

export const createMockSolanaService = () => ({
  getBalance: vi.fn().mockResolvedValue({ balance: 1.5 }),
  sendTransaction: vi.fn().mockResolvedValue({
    signature: 'mock-tx-signature',
  }),
  verifyTransaction: vi.fn().mockResolvedValue({ confirmed: true }),
});

// ============================================================================
// Cache Service Mocks
// ============================================================================

export const createMockCacheService = () => ({
  clear: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  generateKey: vi.fn((...args: string[]) => args.join(':')),
  get: vi.fn().mockResolvedValue(null),
  getTtl: vi.fn().mockResolvedValue(-1),
  invalidateByTags: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(true),
});

// ============================================================================
// Redis Service Mocks
// ============================================================================

export const createMockRedisService = () => ({
  decr: vi.fn().mockResolvedValue(0),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  hdel: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  lpop: vi.fn().mockResolvedValue(null),
  lpush: vi.fn().mockResolvedValue(1),
  lrange: vi.fn().mockResolvedValue([]),
  rpop: vi.fn().mockResolvedValue(null),
  rpush: vi.fn().mockResolvedValue(1),
  set: vi.fn().mockResolvedValue('OK'),
  ttl: vi.fn().mockResolvedValue(-1),
});

// ============================================================================
// File Queue Service Mocks
// ============================================================================

export const createMockFileQueueService = () => ({
  getJobStatus: vi.fn().mockResolvedValue({
    progress: 100,
    status: 'completed',
  }),
  processFile: vi.fn().mockResolvedValue({
    ingredientId: 'mock-ingredient-id',
    jobId: 'mock-file-job-id',
    status: 'completed',
    type: 'video',
  }),
  processVideo: vi.fn().mockResolvedValue({
    ingredientId: 'mock-ingredient-id',
    jobId: 'mock-video-job-id',
    status: 'completed',
    type: 'video',
  }),
  waitForJob: vi.fn().mockResolvedValue({
    s3Key: 'test-key',
    success: true,
    url: 'https://example.com/result.mp4',
  }),
});

// ============================================================================
// BullMQ Queue Mocks
// ============================================================================

export const createMockQueue = () => ({
  add: vi.fn().mockResolvedValue({ id: 'mock-job-id', name: 'mock-job' }),
  addBulk: vi
    .fn()
    .mockResolvedValue([{ id: 'mock-job-1' }, { id: 'mock-job-2' }]),
  close: vi.fn().mockResolvedValue(undefined),
  getJob: vi.fn().mockResolvedValue({
    getState: vi.fn().mockResolvedValue('completed'),
    id: 'mock-job-id',
    name: 'mock-job',
    progress: vi.fn().mockResolvedValue(100),
    returnvalue: { success: true },
  }),
  getJobCounts: vi.fn().mockResolvedValue({
    active: 0,
    completed: 0,
    delayed: 0,
    failed: 0,
    waiting: 0,
  }),
  getJobs: vi.fn().mockResolvedValue([]),
  obliterate: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
});

// ============================================================================
// Logger Service Mock
// ============================================================================

export const createMockLoggerService = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

// ============================================================================
// Config Service Mock
// ============================================================================

export const createMockConfigService = (
  config: Record<string, unknown> = {},
) => ({
  get: vi.fn((key: string) => {
    const defaults: Record<string, unknown> = {
      AWS_ACCESS_KEY_ID: 'test-aws-key',
      AWS_S3_BUCKET: 'test-bucket',
      AWS_SECRET_ACCESS_KEY: 'test-aws-secret',
      CLERK_SECRET_KEY: 'test-clerk-secret',
      ELEVENLABS_API_KEY: 'test-elevenlabs-key',
      GENFEEDAI_APP_URL: 'https://test-app.genfeed.ai',
      GENFEEDAI_WEBHOOKS_URL: 'https://test-webhooks.genfeed.ai',
      JWT_SECRET: 'test-jwt-secret',
      MONGO_URL: 'mongodb://mongo.internal:27017/test',
      NODE_ENV: 'test',
      PORT: 3001,
      REDIS_URL: 'redis://localhost:6379',
      REPLICATE_KEY: 'test-replicate-key',
      STRIPE_SECRET_KEY: 'test-stripe-secret',
      ...config,
    };
    return defaults[key];
  }),
  getNumber: vi.fn((key: string) => {
    const defaults: Record<string, number> = {
      PORT: 3001,
      REDIS_PORT: 6379,
      ...config,
    } as Record<string, number>;
    return defaults[key];
  }),
});

// ============================================================================
// HTTP Service Mock
// ============================================================================

export const createMockHttpService = () => {
  const mockResponse = {
    config: {},
    data: {},
    headers: {},
    status: 200,
    statusText: 'OK',
  };

  return {
    axiosRef: {
      delete: vi.fn().mockResolvedValue(mockResponse),
      get: vi.fn().mockResolvedValue(mockResponse),
      patch: vi.fn().mockResolvedValue(mockResponse),
      post: vi.fn().mockResolvedValue(mockResponse),
      put: vi.fn().mockResolvedValue(mockResponse),
    },
    delete: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      toPromise: vi.fn().mockResolvedValue(mockResponse),
    }),
    get: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      toPromise: vi.fn().mockResolvedValue(mockResponse),
    }),
    patch: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      toPromise: vi.fn().mockResolvedValue(mockResponse),
    }),
    post: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      toPromise: vi.fn().mockResolvedValue(mockResponse),
    }),
    put: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      toPromise: vi.fn().mockResolvedValue(mockResponse),
    }),
  };
};

// ============================================================================
// Publisher Service Mocks
// ============================================================================

export const createMockPublisherService = () => ({
  getAccountInfo: vi.fn().mockResolvedValue({
    id: 'mock-account-id',
    username: 'testuser',
  }),
  publish: vi.fn().mockResolvedValue({
    externalId: 'mock-external-post-id',
    success: true,
    url: 'https://platform.com/post/mock-id',
  }),
  validateCredentials: vi.fn().mockResolvedValue(true),
});

export const createMockPublisherFactoryService = () => ({
  getPublisher: vi.fn().mockReturnValue(createMockPublisherService()),
  getSupportedPlatforms: vi
    .fn()
    .mockReturnValue([
      'youtube',
      'tiktok',
      'instagram',
      'twitter',
      'linkedin',
      'threads',
      'pinterest',
      'reddit',
    ]),
});

// ============================================================================
// Notifications Service Mocks
// ============================================================================

export const createMockNotificationsService = () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ messageId: 'mock-email-id', success: true }),
  sendNotification: vi.fn().mockResolvedValue({ success: true }),
  sendPushNotification: vi.fn().mockResolvedValue({ success: true }),
  sendWebhook: vi.fn().mockResolvedValue({ success: true }),
});

// ============================================================================
// Credit Transactions Service Mocks
// ============================================================================

export const createMockCreditTransactionsService = () => ({
  createTransactionEntry: vi.fn().mockResolvedValue({
    _id: new Types.ObjectId(),
    amount: 100,
    balanceAfter: 100,
    balanceBefore: 0,
    createdAt: new Date(),
    description: 'Credit purchase',
    organization: new Types.ObjectId(),
    source: 'stripe',
    type: 'purchase',
  }),
  getExpiredCredits: vi.fn().mockResolvedValue([]),
  getOrganizationTransactions: vi.fn().mockResolvedValue([]),
  getTransactionsByType: vi.fn().mockResolvedValue([]),
  markCreditsAsExpired: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
});

// ============================================================================
// Crypto Service Mocks
// ============================================================================

export const createMockCryptoService = () => ({
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
});

// ============================================================================
// Event Emitter Mocks
// ============================================================================

export const createMockEventEmitter = () => ({
  emit: vi.fn(),
  emitAsync: vi.fn().mockResolvedValue([]),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
});

// ============================================================================
// All External Services Combined Mock Factory
// ============================================================================

export const createAllExternalServiceMocks = () => ({
  apifyService: createMockApifyService(),
  cacheService: createMockCacheService(),
  clerkClient: createMockClerkClient(),
  clerkService: createMockClerkService(),
  configService: createMockConfigService(),
  creditTransactionsService: createMockCreditTransactionsService(),
  cryptoService: createMockCryptoService(),
  discordService: createMockDiscordService(),
  elevenLabsService: createMockElevenLabsService(),
  eventEmitter: createMockEventEmitter(),
  fileQueueService: createMockFileQueueService(),
  giphyService: createMockGiphyService(),
  hedraService: createMockHedraService(),
  heyGenService: createMockHeyGenService(),
  httpService: createMockHttpService(),
  instagramService: createMockInstagramService(),
  klingAIService: createMockKlingAIService(),
  leonardoAIService: createMockLeonardoAIService(),
  linkedInService: createMockLinkedInService(),
  loggerService: createMockLoggerService(),
  mediumService: createMockMediumService(),
  newsService: createMockNewsService(),
  notificationsService: createMockNotificationsService(),
  opusProService: createMockOpusProService(),
  pinterestService: createMockPinterestService(),
  publisherFactoryService: createMockPublisherFactoryService(),
  redditService: createMockRedditService(),
  redisService: createMockRedisService(),
  replicateService: createMockReplicateService(),
  s3Service: createMockS3Service(),
  solanaService: createMockSolanaService(),
  stripeService: createMockStripeService(),
  telegramService: createMockTelegramService(),
  threadsService: createMockThreadsService(),
  tiktokService: createMockTiktokService(),
  twitterService: createMockTwitterService(),
  xaiService: createMockXAIService(),
  youtubeService: createMockYoutubeService(),
});
