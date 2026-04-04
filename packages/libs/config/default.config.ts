/**
 * Default config service factory for lightweight microservices
 * (telegram, slack) that don't need full Joi validation.
 *
 * Returns a base class with a simple `get()` method backed by process.env.
 */
export function getDefaultConfigService() {
  class DefaultConfigService {
    /**
     * Get a config value from process.env
     */
    get(key: string): string {
      return process.env[key] || '';
    }

    get isDevelopment(): boolean {
      return process.env.NODE_ENV === 'development';
    }

    get isProduction(): boolean {
      return process.env.NODE_ENV === 'production';
    }

    get isTest(): boolean {
      return process.env.NODE_ENV === 'test';
    }
  }

  return DefaultConfigService;
}
