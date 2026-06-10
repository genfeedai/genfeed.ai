import type { IEnvConfig } from '@config/interfaces/env-config.interface';
import Joi from 'joi';

import { baseSchema } from '../schemas/base.schema';
import { BaseConfigService } from './base-config.service';

/**
 * Options for {@link createServiceConfig}.
 */
export interface CreateServiceConfigOptions {
  /** App name used to resolve service-specific .env files (e.g. 'workers'). */
  appName: string;
  /**
   * Working directory context for env-file resolution. Defaults to
   * 'apps/server' since every backend microservice runs from there.
   */
  workingDir?: 'apps/server' | 'root';
  /**
   * Shared schema fragments merged on top of {@link baseSchema}. `baseSchema`
   * (NODE_ENV/PORT/TZ/VERSION) is always included automatically — do not pass
   * it again. Later fragments override earlier ones.
   */
  schemas?: Array<Record<string, Joi.Schema>>;
  /**
   * Inline, service-specific keys merged last (highest precedence). Use this
   * for one-off env vars that have no shared fragment.
   */
  extend?: Record<string, Joi.Schema>;
}

/**
 * Build a concrete ConfigService base class wired to a Joi schema and the
 * shared env-file loader, so backend services no longer hand-roll the same
 * `extends BaseConfigService` + `Joi.object({ ...baseSchema, ... })` boilerplate.
 *
 * `baseSchema` is always merged in; pass additional shared fragments via
 * `schemas` and service-only keys via `extend`. Extend the returned class to
 * add typed getters:
 *
 * ```ts
 * export class ConfigService extends createServiceConfig<WorkersEnvConfig>({
 *   appName: 'workers',
 *   schemas: [postgresSchema, redisSchema],
 *   extend: { GF_DEV_ENABLE_SCHEDULERS: Joi.string().optional().allow('') },
 * }) {
 *   public get isDevSchedulersEnabled(): boolean {
 *     return String(this.get('GF_DEV_ENABLE_SCHEDULERS') ?? '') === 'true';
 *   }
 * }
 * ```
 */
export function createServiceConfig<T extends Partial<IEnvConfig> = IEnvConfig>(
  options: CreateServiceConfigOptions,
): new () => BaseConfigService<T> {
  const {
    appName,
    workingDir = 'apps/server',
    schemas = [],
    extend = {},
  } = options;

  const schema = Joi.object(Object.assign({}, baseSchema, ...schemas, extend));

  class ServiceConfigService extends BaseConfigService<T> {
    constructor() {
      super(schema, { appName, workingDir });
    }
  }

  return ServiceConfigService;
}
