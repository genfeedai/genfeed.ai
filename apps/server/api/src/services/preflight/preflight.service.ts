import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PreflightResult {
  ready: boolean;
  status: 'ready' | 'degraded' | 'not_ready';
  checks: PreflightCheck[];
  timestamp: string;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  message?: string;
  latencyMs?: number;
}

type FeatureKey = 'studio' | 'analytics' | 'trends' | 'marketplace' | 'publish';

const FEATURE_REQUIREMENTS: Record<FeatureKey, string[]> = {
  analytics: ['database'],
  marketplace: ['database', 'storage'],
  publish: ['instagram', 'database'],
  studio: ['openai', 'storage'],
  trends: ['database'],
};

/**
 * Maps service names to the env config keys that must be present.
 * Uses process.env as a fallback since the app's ConfigService validates
 * and loads .env files but the validated config object uses typed keys,
 * not raw env var names. For preflight we just check presence.
 */
const ENV_CHECKS: Record<string, string[]> = {
  database: ['DATABASE_URL'],
  instagram: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
  openai: ['OPENAI_API_KEY'],
  storage: ['AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID'],
};

@Injectable()
export class PreflightService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async checkReadiness(feature?: FeatureKey): Promise<PreflightResult> {
    const services = feature
      ? (FEATURE_REQUIREMENTS[feature] ?? [])
      : [...new Set(Object.values(FEATURE_REQUIREMENTS).flat())];

    const checks = await Promise.all(services.map((s) => this.checkService(s)));
    const allOk = checks.every((c) => c.ok);
    const anyOk = checks.some((c) => c.ok);

    return {
      checks,
      ready: allOk,
      status: allOk ? 'ready' : anyOk ? 'degraded' : 'not_ready',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkService(service: string): Promise<PreflightCheck> {
    const start = Date.now();
    try {
      const requiredEnvs = ENV_CHECKS[service] ?? [];
      // Check against the validated envConfig from the app's ConfigService,
      // falling back to process.env for keys not in the typed config.
      const envConfig = this.config.envConfig;
      const missing = requiredEnvs.filter(
        (env) =>
          !(envConfig as Record<string, unknown>)[env] && !process.env[env],
      );
      if (missing.length > 0) {
        return {
          latencyMs: Date.now() - start,
          message: `Missing: ${missing.join(', ')}`,
          name: service,
          ok: false,
        };
      }
      return { latencyMs: Date.now() - start, name: service, ok: true };
    } catch (error) {
      this.logger.error(`${this.constructorName} check failed: ${service}`, {
        error,
      });
      return {
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown',
        name: service,
        ok: false,
      };
    }
  }
}
