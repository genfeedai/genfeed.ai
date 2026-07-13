import { describe, expect, it } from 'bun:test';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

describe('DesktopAssetProtocolService', () => {
  it('registers the privileged asset scheme and streams registered files', async () => {
    resetElectronMockState();
    const { DesktopAssetProtocolService, registerDesktopAssetScheme } =
      await import('./asset-protocol.service');
    const filesService = {
      resolveLocalAssetFile: async () => ({
        absolutePath: '/workspace/.genfeed/assets/example.png',
        mimeType: 'image/png',
      }),
    };

    registerDesktopAssetScheme();
    new DesktopAssetProtocolService(filesService as never).register();

    expect(electronMockState.protocol.privilegedSchemes).toEqual([
      'genfeed-asset',
    ]);
    const handler = electronMockState.protocol.handlers.get('genfeed-asset');
    expect(handler).toBeDefined();

    const response = await handler?.(
      new Request('genfeed-asset://local/asset-1'),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('image/png');
    expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(electronMockState.net.fetchRequests).toEqual([
      'file:///workspace/.genfeed/assets/example.png',
    ]);
  });

  it('does not resolve malformed or unknown asset URLs', async () => {
    resetElectronMockState();
    const { DesktopAssetProtocolService } = await import(
      './asset-protocol.service'
    );
    let resolutionCount = 0;
    const filesService = {
      resolveLocalAssetFile: async () => {
        resolutionCount += 1;
        throw new Error('Unknown asset');
      },
    };
    new DesktopAssetProtocolService(filesService as never).register();
    const handler = electronMockState.protocol.handlers.get('genfeed-asset');

    const traversalResponse = await handler?.(
      new Request('genfeed-asset://local/%2E%2E%2Fprivate.png'),
    );
    const unknownResponse = await handler?.(
      new Request('genfeed-asset://local/unknown-asset'),
    );

    expect(traversalResponse?.status).toBe(404);
    expect(unknownResponse?.status).toBe(404);
    expect(resolutionCount).toBe(1);
    expect(electronMockState.net.fetchRequests).toEqual([]);
  });
});
