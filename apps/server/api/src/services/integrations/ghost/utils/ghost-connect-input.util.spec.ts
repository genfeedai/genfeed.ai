import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';
import { parseGhostConnectInput } from './ghost-connect-input.util';

const KEY = '64f0c0ab12cd34ef56ab78cd:9a1b2c3d4e5f60718293a4b5c6d7e8f9';

describe('parseGhostConnectInput', () => {
  it.each([
    ['https://myblog.com', 'https://myblog.com'],
    ['  https://myblog.com///  ', 'https://myblog.com'],
    ['myblog.com', 'myblog.com'],
    ['https://myblog.com/ghost/', 'https://myblog.com'],
    ['https://myblog.com/ghost/#/dashboard', 'https://myblog.com'],
    ['https://example.com/blog', 'https://example.com/blog'],
  ])('accepts %j as the site %j', (url, ghostUrl) => {
    expect(parseGhostConnectInput(url, ` ${KEY} `)).toEqual({
      apiKey: KEY,
      ghostUrl,
      ok: true,
    });
  });

  it.each([
    ['http://myblog.com', KEY, ApiKeyConnectErrorCode.HTTPS_REQUIRED],
    ['ftp://myblog.com', KEY, ApiKeyConnectErrorCode.INVALID_URL],
    ['https://user:pass@myblog.com', KEY, ApiKeyConnectErrorCode.INVALID_URL],
    ['https://myblog.com?x=1', KEY, ApiKeyConnectErrorCode.INVALID_URL],
    ['localhost', KEY, ApiKeyConnectErrorCode.INVALID_URL],
    ['https://', KEY, ApiKeyConnectErrorCode.INVALID_URL],
    [
      'https://myblog.com',
      'not-a-key',
      ApiKeyConnectErrorCode.INVALID_KEY_FORMAT,
    ],
    [
      'https://myblog.com',
      '64f0c0:abc',
      ApiKeyConnectErrorCode.INVALID_KEY_FORMAT,
    ],
    [
      'https://myblog.com',
      '64f0c0:zz',
      ApiKeyConnectErrorCode.INVALID_KEY_FORMAT,
    ],
    [
      'https://myblog.com',
      'ghost-content-key',
      ApiKeyConnectErrorCode.INVALID_KEY_FORMAT,
    ],
  ])('refuses %j with key %j as %s', (url, apiKey, code) => {
    expect(parseGhostConnectInput(url, apiKey)).toEqual({ code, ok: false });
  });
});
