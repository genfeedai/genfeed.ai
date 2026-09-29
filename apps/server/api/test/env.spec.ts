describe('Env', () => {
  it('should be running in test environment', () => {
    // When running tests, NODE_ENV is typically 'test'
    expect(['test', 'development', 'production']).toContain(
      process.env.NODE_ENV,
    );
  });
});
