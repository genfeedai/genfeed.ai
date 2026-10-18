import { randomBytes } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { safeFetch } from '@libs/security/destination-guard';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { RegisterOAuthClientDto } from '../dto/register-client.dto';

export type OAuthClientRecord = {
  clientId: string;
  clientName: string | null;
  createdAt: Date;
  grantTypes: string[];
  redirectUris: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
};

const CLIENT_METADATA_MAX_BYTES = 64 * 1024;
const clientMetadataSchema = z.object({
  client_id: z.string().max(2048),
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().max(2048)).min(1).max(20),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .default(['authorization_code']),
  response_types: z.array(z.literal('code')).default(['code']),
  token_endpoint_auth_method: z.literal('none').default('none'),
});

async function readClientMetadata(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty client metadata');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CLIENT_METADATA_MAX_BYTES)
        throw new Error('Client metadata too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function oauthError(error: string, description: string): BadRequestException {
  return new BadRequestException({
    error,
    error_description: description,
  });
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

/**
 * Schemes a redirect can never use. Script-bearing and local-document schemes
 * would execute or load in the consent page's origin when it navigates to the
 * redirect; the remaining network schemes deliver the code in plaintext or
 * cannot be navigated to at all. `http:` is handled separately (loopback only).
 */
const FORBIDDEN_REDIRECT_SCHEMES: ReadonlySet<string> = new Set([
  'about',
  'blob',
  'data',
  'file',
  'filesystem',
  'ftp',
  'javascript',
  'mailto',
  'sms',
  'tel',
  'vbscript',
  'view-source',
  'ws',
  'wss',
]);

/**
 * Whether `requested` is a registered redirect. Loopback http redirects match
 * on everything but the port (RFC 8252 §7.3): native clients such as Codex bind
 * an ephemeral port per login and register the portless URI.
 */
function isRegisteredRedirectUri(
  registered: readonly string[],
  requested: string,
): boolean {
  if (registered.includes(requested)) {
    return true;
  }
  const target = new URL(requested);
  if (target.protocol !== 'http:' || !isLoopback(target.hostname)) {
    return false;
  }
  return registered.some((entry) => {
    const candidate = new URL(entry);
    return (
      candidate.protocol === 'http:' &&
      candidate.hostname === target.hostname &&
      candidate.pathname === target.pathname &&
      candidate.search === target.search
    );
  });
}

/**
 * Accepts https, loopback http (RFC 8252 §7.3), and any native-app
 * private-use scheme (RFC 8252 §7.1). Reverse-domain schemes are recommended
 * but not required: Cursor's MCP client — which Grok Bot runs on — registers
 * `cursor://anysphere.cursor-mcp/oauth/callback` (#4948). Requiring a dot
 * adds no protection, since any client can register a dotted scheme or an
 * https redirect it controls; PKCE and the consent screen carry the security.
 */
function validateRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw oauthError('invalid_redirect_uri', 'Redirect URI is not a valid URL');
  }

  if (url.hash || url.username || url.password) {
    throw oauthError(
      'invalid_redirect_uri',
      'Redirect URI must not carry a fragment or credentials',
    );
  }

  if (url.protocol === 'https:') {
    return url.toString();
  }

  if (url.protocol === 'http:') {
    if (isLoopback(url.hostname)) {
      return url.toString();
    }
    throw oauthError(
      'invalid_redirect_uri',
      'Plain http redirect URIs are only allowed for loopback hosts',
    );
  }

  const scheme = url.protocol.slice(0, -1);
  if (
    /^[a-z][a-z0-9+.-]*$/.test(scheme) &&
    !FORBIDDEN_REDIRECT_SCHEMES.has(scheme)
  ) {
    return url.toString();
  }

  throw oauthError(
    'invalid_redirect_uri',
    `Redirect URI scheme "${scheme}" is not allowed`,
  );
}

@Injectable()
export class OAuthClientService {
  private readonly documentClients = new Map<
    string,
    { client: OAuthClientRecord; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterOAuthClientDto) {
    const redirectUris = Array.from(
      new Set(dto.redirect_uris.map(validateRedirectUri)),
    );
    const clientId = `oauth_${randomBytes(24).toString('base64url')}`;

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: dto.client_name,
        grantTypes: ['authorization_code', 'refresh_token'],
        redirectUris,
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'none',
      },
    });

    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      ...(client.clientName ? { client_name: client.clientName } : {}),
      grant_types: client.grantTypes,
      redirect_uris: client.redirectUris,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    };
  }

  async requireClient(
    clientId: string,
    redirectUri?: string,
  ): Promise<OAuthClientRecord> {
    const client = clientId.startsWith('oauth_')
      ? await this.prisma.oAuthClient.findUnique({ where: { clientId } })
      : await this.resolveDocumentClient(clientId);
    if (!client) {
      throw oauthError('invalid_client', 'Unknown OAuth client');
    }

    if (redirectUri) {
      let normalizedRedirectUri: string;
      try {
        normalizedRedirectUri = new URL(redirectUri).toString();
      } catch {
        throw oauthError('invalid_request', 'Invalid redirect URI');
      }
      if (
        !isRegisteredRedirectUri(client.redirectUris, normalizedRedirectUri)
      ) {
        throw oauthError('invalid_request', 'Unregistered redirect URI');
      }
    }

    if (!clientId.startsWith('oauth_')) {
      // Grant and refresh rows reference oauth_clients.clientId. Persist only
      // validated document metadata; subsequent requests still resolve CIMD
      // rather than trusting this snapshot as a registered client.
      const metadata = {
        clientName: client.clientName,
        grantTypes: client.grantTypes,
        redirectUris: client.redirectUris,
        responseTypes: client.responseTypes,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      };
      await this.prisma.oAuthClient.upsert({
        where: { clientId },
        create: { clientId, ...metadata },
        update: metadata,
      });
    }
    return client;
  }

  private async resolveDocumentClient(
    clientId: string,
  ): Promise<OAuthClientRecord> {
    try {
      const url = new URL(clientId);
      if (
        url.protocol !== 'https:' ||
        url.pathname === '/' ||
        url.username ||
        url.password ||
        url.hash ||
        clientId.length > 2048
      ) {
        throw new Error('Invalid client metadata URL');
      }
      const cached = this.documentClients.get(clientId);
      if (cached && cached.expiresAt > Date.now()) return cached.client;
      this.documentClients.delete(clientId);
      const response = await safeFetch(
        clientId,
        {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        },
        { allowedSchemes: ['https:'], maxRedirects: 0 },
      );
      if (
        !response.ok ||
        response.headers
          .get('content-type')
          ?.split(';')[0]
          .trim()
          .toLowerCase() !== 'application/json' ||
        Number(response.headers.get('content-length') ?? 0) >
          CLIENT_METADATA_MAX_BYTES
      ) {
        await response.body?.cancel();
        throw new Error('Invalid client metadata response');
      }
      const metadata = clientMetadataSchema.parse(
        await readClientMetadata(response),
      );
      if (metadata.client_id !== clientId)
        throw new Error('Client metadata identity mismatch');
      const client: OAuthClientRecord = {
        clientId,
        clientName: metadata.client_name,
        createdAt: new Date(),
        grantTypes: metadata.grant_types,
        redirectUris: metadata.redirect_uris.map(validateRedirectUri),
        responseTypes: metadata.response_types,
        tokenEndpointAuthMethod: metadata.token_endpoint_auth_method,
      };
      const cacheControl = response.headers.get('cache-control') ?? '';
      const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl)?.[1];
      const ttl = /(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|$)/i.test(
        cacheControl,
      )
        ? 0
        : Math.min(Number(maxAge ?? 60), 300) * 1000;
      if (ttl > 0) {
        if (this.documentClients.size >= 256) {
          const oldest = this.documentClients.keys().next().value;
          if (oldest !== undefined) this.documentClients.delete(oldest);
        }
        this.documentClients.set(clientId, {
          client,
          expiresAt: Date.now() + ttl,
        });
      }
      return client;
    } catch {
      throw oauthError(
        'invalid_client',
        'Unable to validate client metadata document',
      );
    }
  }
}
