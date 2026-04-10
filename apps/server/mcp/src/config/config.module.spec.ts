import { ConfigModule } from './config.module';

describe('ConfigModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GENFEEDAI_API_URL: 'http://localhost:3010',
      NODE_ENV: 'test',
      PORT: '3014',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(ConfigModule).toBeDefined();
  });
});
