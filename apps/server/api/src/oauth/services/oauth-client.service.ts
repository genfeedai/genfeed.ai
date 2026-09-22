import { randomBytes } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
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
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });
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
      if (!client.redirectUris.includes(normalizedRedirectUri)) {
        throw oauthError('invalid_request', 'Unregistered redirect URI');
      }
    }

    return client;
  }
}
