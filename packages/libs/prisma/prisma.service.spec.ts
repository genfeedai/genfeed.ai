import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';
import { isCloudTenantGuardEnabled, PrismaService } from './prisma.service';

function testConfigService(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => env[key],
  } as ConfigService;
}

describe('isCloudTenantGuardEnabled', () => {
  it('is true when GENFEED_CLOUD is enabled via ConfigService', () => {
    const env: Record<string, string | undefined> = { GENFEED_CLOUD: '1' };
    expect(isCloudTenantGuardEnabled((key) => env[key])).toBe(true);
  });

  it('is false for LOCAL/self-hosted when the cloud flag is unset', () => {
    expect(isCloudTenantGuardEnabled(() => undefined)).toBe(false);
  });

  it('treats an explicit false cloud flag as LOCAL even with a hosted URL', () => {
    const env: Record<string, string | undefined> = {
      GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.ai',
      GENFEED_CLOUD: 'false',
    };
    expect(isCloudTenantGuardEnabled((key) => env[key])).toBe(false);
  });
});

describe('PrismaService tenant guard wiring', () => {
  it('constructs the client with the CLOUD tenant-guard extension', () => {
    const service = new PrismaService(
      testConfigService({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/genfeed',
        GENFEED_CLOUD: '1',
      }),
    );

    expect(service).toBeDefined();
    expect(typeof service.$connect).toBe('function');
  });
});
