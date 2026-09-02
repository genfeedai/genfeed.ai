import {
  isAwsS3PublicHost,
  readUsableCdnAssetUrl,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { describe, expect, it } from 'vitest';

describe('isAwsS3PublicHost', () => {
  it.each([
    's3.amazonaws.com',
    'bucket.s3.amazonaws.com',
    's3.us-east-1.amazonaws.com',
    'bucket.s3-us-west-2.amazonaws.com',
    'bucket.s3.ap-northeast-1.amazonaws.com.cn',
  ])('accepts %s', (hostname) => {
    expect(isAwsS3PublicHost(hostname)).toBe(true);
  });

  it.each([
    'evil.amazonaws.com',
    's3.example.com',
    'amazonaws.com',
    'nots3.amazonaws.com',
  ])('rejects %s', (hostname) => {
    expect(isAwsS3PublicHost(hostname)).toBe(false);
  });
});

describe('readUsableCdnAssetUrl', () => {
  const ingredientsEndpoint = 'https://cdn.example.com/ingredients';

  it('accepts a virtual-hosted S3 URL', () => {
    expect(
      readUsableCdnAssetUrl(
        { url: 'https://bucket.s3.us-east-1.amazonaws.com/key.png' },
        ingredientsEndpoint,
      ),
    ).toBe('https://bucket.s3.us-east-1.amazonaws.com/key.png');
  });

  it('rejects a lookalike host that is not S3', () => {
    expect(
      readUsableCdnAssetUrl(
        { url: 'https://evil.amazonaws.com/key.png' },
        ingredientsEndpoint,
      ),
    ).toBeUndefined();
  });
});
