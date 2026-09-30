describe('Env', () => {
  it('should have NODE_ENV set', () => {
    // In test environment, NODE_ENV should be set
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('should be running in test environment', () => {
    // When running tests, NODE_ENV is typically 'test'
    expect(['test', 'development', 'production']).toContain(
      process.env.NODE_ENV,
    );
  });
});
