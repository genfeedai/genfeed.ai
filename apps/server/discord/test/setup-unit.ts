import 'reflect-metadata';

// Setup for unit tests
beforeAll(() => {
  // Mock process.env for tests
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup after all tests
});
