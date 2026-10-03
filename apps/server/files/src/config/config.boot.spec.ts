import { ConfigService } from '@files/config/config.service';

// The unit setup substitutes the config factory. This fixture must exercise
// real Joi schema composition and construction of the Files service config.
vi.unmock('@genfeedai/config');

describe('Files configuration boot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      GENFEED_CLOUD: 'true',
      GENFEEDAI_API_PUBLIC_URL: 'http://localhost:3010',
      GENFEEDAI_API_URL: 'http://localhost:3010',
      GENFEEDAI_CDN_URL: 'https://media.test',
      GENFEEDAI_MCP_PUBLIC_URL: 'http://localhost:3010/mcp',
      NODE_ENV: 'test',
      PORT: '3002',
      REDIS_URL: 'redis://localhost:6379',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('boots with authorized media disabled by default', () => {
    expect(new ConfigService().isAuthorizedMediaDeliveryEnabled).toBe(false);
  });

  it('boots with authorized media enabled for cloud', () => {
    process.env.GENFEEDAI_MEDIA_ISSUER_ENABLED = 'true';
    expect(new ConfigService().isAuthorizedMediaDeliveryEnabled).toBe(true);
  });

  it('keeps self-hosted delivery unchanged with the flag enabled', () => {
    process.env.GENFEED_CLOUD = 'false';
    process.env.GENFEEDAI_MEDIA_ISSUER_ENABLED = 'true';
    expect(new ConfigService().isAuthorizedMediaDeliveryEnabled).toBe(false);
  });
});
