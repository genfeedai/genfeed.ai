import { AWSConfigService } from '@api/config/services/aws.config';
import { describe, expect, it, vi } from 'vitest';

describe('AWSConfigService', () => {
  it('reads region, keys, and bucket from ConfigService', () => {
    const values: Record<string, string> = {
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_REGION: 'us-east-1',
      AWS_S3_BUCKET: 'genfeed-media',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    };
    const configService = {
      get: vi.fn((key: string) => values[key]),
    };
    const aws = new AWSConfigService(configService as never);

    expect(aws.config).toEqual({
      accessKeyId: 'test-access-key',
      bucket: 'genfeed-media',
      region: 'us-east-1',
      secretAccessKey: 'test-secret-key',
    });
    expect(aws.region).toBe('us-east-1');
    expect(aws.accessKeyId).toBe('test-access-key');
    expect(aws.secretAccessKey).toBe('test-secret-key');
    expect(aws.bucket).toBe('genfeed-media');
  });
});
