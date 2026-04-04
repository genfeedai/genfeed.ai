const originalEnv = process.env;
let AppModule: typeof import('@files/app.module').AppModule;

describe('AppModule (Files)', () => {
  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      CLERK_SECRET_KEY: 'sk_test_clerk_secret',
      GENFEEDAI_API_URL: 'http://localhost:3001',
      GENFEEDAI_CDN_URL: 'https://cdn.genfeed.ai',
      NODE_ENV: 'test',
      PORT: '3002',
    };

    ({ AppModule } = await import('@files/app.module'));
  }, 60_000);

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be importable', () => {
    expect(AppModule).toBeDefined();
  });
});
