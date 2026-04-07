import { AppModule } from './app.module';

describe('AppModule (MCP)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GENFEEDAI_API_URL: 'http://localhost:3010',
      NODE_ENV: 'test',
      PORT: '3010',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be importable', () => {
    expect(AppModule).toBeDefined();
  });
});
