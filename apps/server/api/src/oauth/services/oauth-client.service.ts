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

function validateRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw oauthError('invalid_client_metadata', 'Invalid redirect URI');
  }

  if (url.hash || url.username || url.password) {
    throw oauthError('invalid_client_metadata', 'Invalid redirect URI');
  }

  if (url.protocol === 'https:') {
    return url.toString();
  }

  if (url.protocol === 'http:' && isLoopback(url.hostname)) {
    return url.toString();
  }

  const privateUseScheme = url.protocol.slice(0, -1);
  if (
    privateUseScheme.includes('.') &&
    /^[a-z][a-z0-9+.-]*$/.test(privateUseScheme)
  ) {
    return url.toString();
  }

  throw oauthError('invalid_client_metadata', 'Invalid redirect URI');
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
        grantTypes: ['authorization_code'],
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
