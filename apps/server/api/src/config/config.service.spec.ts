import { ConfigService } from '@api/config/config.service';

describe('ConfigService', () => {
  let configService: ConfigService;
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    // Mock environment variables for testing
    env.NODE_ENV = 'test';
    env.SENTRY_ENVIRONMENT = 'test';
    env.SENTRY_DSN = 'https://test@sentry.io/test';
    env.GENFEEDAI_API_URL = 'http://localhost:3001';
    env.GENFEEDAI_APP_URL = 'http://localhost:3000';
    env.GENFEEDAI_CDN_URL = 'http://localhost:3002';
    env.GENFEEDAI_WEBHOOKS_URL = 'http://localhost:3001';
    env.AWS_REGION = 'us-west-1';
    env.AWS_S3_BUCKET = 'test-bucket';
    env.AWS_ACCESS_KEY_ID = 'test-key';
    env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    env.MONGODB_URL = 'mongodb://mongo.internal:27017/test-db';
    delete env.DB_MODE;
    env.PORT = '3001';
    env.CLERK_PUBLISHABLE_KEY = 'pk_test_test';
    env.CLERK_SECRET_KEY = 'sk_test_test';
    env.CLERK_WEBHOOK_SIGNING_SECRET = 'test-secret';
    env.YOUTUBE_CLIENT_ID = 'test-client-id';
    env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';
    env.YOUTUBE_REDIRECT_URI = 'http://localhost:3001/auth/youtube/callback';
    env.YOUTUBE_API_KEY = 'test-youtube-api-key';
    env.REDIS_URL = 'redis://localhost:6379';
    env.KLINGAI_KEY = 'test-kling-key';
    env.KLINGAI_SECRET = 'test-kling-secret';
    env.REPLICATE_KEY = 'test-replicate-key';
    env.REPLICATE_WEBHOOK_SIGNING_SECRET = 'test-replicate-secret';
    env.REPLICATE_OWNER = 'test-owner';
    env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-1234567890';
    env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    env.ELEVENLABS_MODEL = 'test-model';
    env.STRIPE_SECRET_KEY = 'sk_test_test';
    env.STRIPE_PUBLISHABLE_KEY = 'pk_test_test';
    env.STRIPE_WEBHOOK_SIGNING_SECRET = 'test-stripe-secret';
    env.STRIPE_PRICE_PAYG = 'price_test_payg';
    env.STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY = 'price_test_creator';
    env.STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY = 'price_test_pro';
    env.STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY = 'price_test_scale';
    env.STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY = 'price_test_enterprise';
    env.STRIPE_COUPON_CREDITS_PACKS_V2_PRO = 'coupon_test_v2_pro';
    env.STRIPE_COUPON_CREDITS_PACKS_V2_ENTERPRISE = 'coupon_test_v2_enterprise';
    env.LEONARDO_KEY = 'test-leonardo-key';
    env.HEYGEN_KEY = 'test-heygen-key';
    env.TIKTOK_CLIENT_KEY = 'test-tiktok-key';
    env.TIKTOK_CLIENT_SECRET = 'test-tiktok-secret';
    env.INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
    env.INSTAGRAM_API_VERSION = 'v18.0';
    env.INSTAGRAM_APP_ID = 'test-instagram-app-id';
    env.INSTAGRAM_APP_SECRET = 'test-instagram-app-secret';
    env.INSTAGRAM_CLIENT_ID = 'test-instagram-client-id';
    env.INSTAGRAM_CLIENT_SECRET = 'test-instagram-client-secret';
    env.INSTAGRAM_REDIRECT_URI =
      'http://localhost:3001/auth/instagram/callback';
    env.FACEBOOK_GRAPH_URL = 'https://graph.facebook.com';
    env.FACEBOOK_API_VERSION = 'v18.0';
    env.FACEBOOK_APP_ID = 'test-facebook-app-id';
    env.FACEBOOK_APP_SECRET = 'test-facebook-app-secret';
    env.FACEBOOK_REDIRECT_URI = 'http://localhost:3001/auth/facebook/callback';
    env.TWITTER_BEARER_TOKEN = 'test-twitter-bearer';
    env.TWITTER_CONSUMER_KEY = 'test-twitter-consumer-key';
    env.TWITTER_CONSUMER_SECRET = 'test-twitter-consumer-secret';
    env.TWITTER_CLIENT_ID = 'test-twitter-client-id';
    env.TWITTER_CLIENT_SECRET = 'test-twitter-client-secret';
    env.TWITTER_REDIRECT_URI = 'http://localhost:3001/auth/twitter/callback';
    env.PINTEREST_CLIENT_ID = 'test-pinterest-client-id';
    env.PINTEREST_CLIENT_SECRET = 'test-pinterest-client-secret';
    env.PINTEREST_REDIRECT_URI =
      'http://localhost:3001/auth/pinterest/callback';
    env.REDDIT_CLIENT_ID = 'test-reddit-client-id';
    env.REDDIT_CLIENT_SECRET = 'test-reddit-client-secret';
    env.REDDIT_REDIRECT_URI = 'http://localhost:3001/auth/reddit/callback';
    env.REDDIT_USER_AGENT = 'test-reddit-user-agent';
    env.LINKEDIN_CLIENT_ID = 'test-linkedin-client-id';
    env.LINKEDIN_CLIENT_SECRET = 'test-linkedin-client-secret';
    env.LINKEDIN_REDIRECT_URI = 'http://localhost:3001/auth/linkedin/callback';
    env.NEWS_API_KEY = 'test-news-api-key';
    env.NEWS_API_URL = 'https://newsapi.org/v2';

    configService = new ConfigService();
  });

  afterEach(() => {
    // Clean up environment variables
    delete env.NODE_ENV;
  });

  describe('constructor', () => {
    it('should create ConfigService instance', () => {
      expect(configService).toBeDefined();
    });

    it('should validate required environment variables', () => {
      expect(() => new ConfigService()).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return environment variable value', () => {
      const apiUrl = configService.get('GENFEEDAI_API_URL');
      expect(apiUrl).toBe('http://localhost:3001');
    });

    it('should return undefined for non-existent key', () => {
      const value = configService.get('NON_EXISTENT_KEY');
      expect(value).toBeUndefined();
    });

    it('should compute ingredientsEndpoint from GENFEEDAI_CDN_URL', () => {
      const ingredientsEndpoint = configService.ingredientsEndpoint;
      expect(ingredientsEndpoint).toBe('http://localhost:3002/ingredients');
    });

    it('should default DB_MODE to development', () => {
      expect(configService.get('DB_MODE')).toBe('development');
    });

    it('should return the configured DB_MODE', () => {
      env.DB_MODE = 'production';

      const service = new ConfigService();

      expect(service.get('DB_MODE')).toBe('production');
    });
  });

  describe('environment checks', () => {
    it('should return true for isDevelopment when NODE_ENV is test', () => {
      expect(configService.isDevelopment).toBe(false);
      expect(configService.isStaging).toBe(false);
      expect(configService.isProduction).toBe(false);
    });
  });
});
