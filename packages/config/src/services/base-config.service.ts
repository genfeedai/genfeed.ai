import fs from 'node:fs';
import type { IEnvConfig } from '@config/interfaces/env-config.interface';
import dotenv from 'dotenv';
import Joi from 'joi';

export interface ConfigServiceOptions {
  /**
   * The app name used for finding app-specific .env files
   * e.g., 'api' will look for 'api/.env'
   */
  appName: string;

  /**
   * Working directory context. Determines how env file paths are resolved.
   * - 'apps/server': Script runs from apps/server/ (e.g., `cd apps/server && nest start`)
   * - 'root': Script runs from monorepo root
   */
  workingDir: 'apps/server' | 'root';
}

/**
 * Base configuration service that handles env file loading.
 * Extend this class and call super() with your Joi schema.
 */
export abstract class BaseConfigService<
  T extends Partial<IEnvConfig> = IEnvConfig,
> {
  protected readonly envConfig: T;

  constructor(schema: Joi.ObjectSchema, options: ConfigServiceOptions) {
    const config = this.loadEnvFiles(options);
    this.envConfig = this.validateInput(config, schema);
  }

  /**
   * Get a config value by key
   */
  public get<K extends keyof T>(key: K): T[K] {
    return this.envConfig[key];
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment(): boolean {
    return this.envConfig.NODE_ENV === 'development';
  }

  /**
   * Check if running in staging mode
   */
  get isStaging(): boolean {
    return this.envConfig.NODE_ENV === 'staging';
  }

  /**
   * Check if running in production mode
   */
  get isProduction(): boolean {
    return this.envConfig.NODE_ENV === 'production';
  }

  /**
   * Check if running in test mode
   */
  get isTest(): boolean {
    return this.envConfig.NODE_ENV === 'test';
  }

  /**
   * Load env files in the correct order based on NODE_ENV and working directory
   */
  private loadEnvFiles(options: ConfigServiceOptions): Record<string, unknown> {
    // Build config from files first, then let live process.env win.
    // This preserves root + service env file layering without clobbering
    // runtime overrides injected by Docker Compose or the shell.
    let config: Record<string, unknown> = {};

    const env = process.env.NODE_ENV;
    const isProduction = env === 'production';
    const isStaging = env === 'staging';
    const isTest = env === 'test';
    const { appName, workingDir } = options;

    let envFiles: string[];

    if (workingDir === 'apps/server') {
      // Running from apps/server/ directory
      // Load order: root first (base), then service-specific (overrides)
      // Later files override earlier ones via spread operator
      envFiles = isProduction
        ? ['../../.env.production', `${appName}/.env.production`]
        : isStaging
          ? ['../../.env.staging', `${appName}/.env.staging`]
          : isTest
            ? ['../../.env.test', `${appName}/.env.test`]
            : [
                '../../.env',
                '../../.env.local',
                `${appName}/.env`,
                `${appName}/.env.local`,
              ];
    } else {
      // Running from monorepo root
      // Load order: root first (base), then service-specific (overrides)
      envFiles = isProduction
        ? ['.env.production', `apps/server/${appName}/.env.production`]
        : isStaging
          ? ['.env.staging', `apps/server/${appName}/.env.staging`]
          : isTest
            ? ['.env.test', `apps/server/${appName}/.env.test`]
            : [
                '.env',
                '.env.local',
                `apps/server/${appName}/.env`,
                `apps/server/${appName}/.env.local`,
              ];
    }

    // Load each env file in order (later files override earlier ones)
    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        const envConfig = dotenv.parse(fs.readFileSync(envFile));
        config = { ...config, ...envConfig };
      }
    }

    return { ...config, ...process.env };
  }

  /**
   * Validate config against Joi schema
   */
  private validateInput(
    envConfig: Record<string, unknown>,
    schema: Joi.ObjectSchema,
  ): T {
    const { error, value: validatedEnvConfig } = schema.validate(envConfig, {
      allowUnknown: true, // Allow unknown env vars (like NVM_INC)
      stripUnknown: false, // Keep unknown vars for debugging
    });

    if (error) {
      throw new Error(`Config validation error: ${error.message}`);
    }

    return validatedEnvConfig as T;
  }
}
