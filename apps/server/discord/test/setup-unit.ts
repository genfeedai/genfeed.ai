import 'reflect-metadata';

// Setup for unit tests
beforeAll(() => {
  // Mock process.env for tests
  vi.stubEnv('NODE_ENV', 'test');
});

afterAll(() => {
  // Cleanup after all tests
});
