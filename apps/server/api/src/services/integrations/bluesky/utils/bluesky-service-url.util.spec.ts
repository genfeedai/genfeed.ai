import {
  BLUESKY_DEFAULT_SERVICE_URL,
  normalizeBlueskyIdentifier,
  parseBlueskyServiceUrl,
} from '@api/services/integrations/bluesky/utils/bluesky-service-url.util';
import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('parseBlueskyServiceUrl', () => {
  it.each([
    [undefined, BLUESKY_DEFAULT_SERVICE_URL],
    ['', BLUESKY_DEFAULT_SERVICE_URL],
    ['  ', BLUESKY_DEFAULT_SERVICE_URL],
    ['pds.example.com', 'https://pds.example.com'],
    ['https://pds.example.com/', 'https://pds.example.com'],
  ])('accepts %j as %s', (input, serviceUrl) => {
    expect(parseBlueskyServiceUrl(input)).toEqual({ ok: true, serviceUrl });
  });

  it.each([
    ['http://pds.example.com', ApiKeyConnectErrorCode.HTTPS_REQUIRED],
    ['https://pds.example.com/xrpc', ApiKeyConnectErrorCode.INVALID_URL],
    [
      `https://${'user'}:${'secret'}@pds.example.com`,
      ApiKeyConnectErrorCode.INVALID_URL,
    ],
    ['https://pds.example.com?x=1', ApiKeyConnectErrorCode.INVALID_URL],
    ['https://pds.example.com:8443', ApiKeyConnectErrorCode.INVALID_URL],
    ['not a url', ApiKeyConnectErrorCode.INVALID_URL],
  ])('rejects %j', (input, code) => {
    expect(parseBlueskyServiceUrl(input)).toEqual({ code, ok: false });
  });
});

describe('normalizeBlueskyIdentifier', () => {
  it('drops the @ and lower-cases a handle', () => {
    expect(normalizeBlueskyIdentifier(' @Alice.Bsky.Social ')).toBe(
      'alice.bsky.social',
    );
  });

  it('keeps a DID exactly', () => {
    expect(normalizeBlueskyIdentifier('did:plc:AbC123')).toBe('did:plc:AbC123');
  });
});
