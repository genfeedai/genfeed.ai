import { pathToFileURL } from 'node:url';
import {
  DESKTOP_ASSET_PROTOCOL_SCHEME,
  parseDesktopAssetUrl,
} from '@genfeedai/desktop-contracts';
import { net, protocol } from 'electron';
import type { DesktopFilesService } from './files.service';

const NOT_FOUND_RESPONSE = (): Response =>
  new Response('Asset not found.', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
    status: 404,
  });

export function registerDesktopAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      privileges: {
        corsEnabled: true,
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
      },
      scheme: DESKTOP_ASSET_PROTOCOL_SCHEME,
    },
  ]);
}

export class DesktopAssetProtocolService {
  constructor(private readonly filesService: DesktopFilesService) {}

  register(): void {
    protocol.handle(DESKTOP_ASSET_PROTOCOL_SCHEME, async (request) => {
      const assetId = parseDesktopAssetUrl(request.url);

      if (!assetId) {
        return NOT_FOUND_RESPONSE();
      }

      try {
        const asset = await this.filesService.resolveLocalAssetFile(assetId);
        const range = request.headers.get('range');
        const fileResponse = await net.fetch(
          pathToFileURL(asset.absolutePath).toString(),
          range ? { headers: { Range: range } } : undefined,
        );

        if (!fileResponse.ok) {
          return NOT_FOUND_RESPONSE();
        }

        const headers = new Headers(fileResponse.headers);
        headers.set('Cache-Control', 'private, max-age=60');
        headers.set('Content-Type', asset.mimeType);
        headers.set('X-Content-Type-Options', 'nosniff');

        return new Response(fileResponse.body, {
          headers,
          status: fileResponse.status,
          statusText: fileResponse.statusText,
        });
      } catch {
        return NOT_FOUND_RESPONSE();
      }
    });
  }
}
