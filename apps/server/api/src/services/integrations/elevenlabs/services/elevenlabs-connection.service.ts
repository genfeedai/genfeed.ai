import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ApiKeyCategory, ByokProvider } from '@genfeedai/contracts';
import type { ElevenLabsConnectionRef } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface ResolvedElevenLabsConnection {
  apiKey: string;
  binding: ElevenLabsConnectionRef & { credentialVersionId: string };
}

/**
 * Resolves the ElevenLabs account a request runs on. A personal (`byok`)
 * binding never falls back to the platform account.
 */
@Injectable()
export class ElevenLabsConnectionService {
  constructor(
    private readonly byokService: ByokService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
  ) {}

  async findPersonalConnection(
    organizationId: string,
  ): Promise<ResolvedElevenLabsConnection | undefined> {
    const credential = await this.byokService.lookupApiKeyWithIdentity(
      organizationId,
      ByokProvider.ELEVENLABS,
    );
    if (!credential) {
      return undefined;
    }
    return {
      apiKey: credential.apiKey,
      binding: {
        credentialVersionId: credential.credentialId,
        kind: 'byok',
        organizationId,
        provider: 'elevenlabs',
      },
    };
  }

  async resolve(
    organizationId: string,
    kind: ElevenLabsConnectionRef['kind'],
  ): Promise<ResolvedElevenLabsConnection> {
    if (kind === 'byok') {
      const connection = await this.findPersonalConnection(organizationId);
      if (!connection) {
        throw new BadRequestException(
          'Reconnect your ElevenLabs account to use this voice.',
        );
      }
      return connection;
    }

    const apiKey = this.apiKeyHelperService.getApiKey(
      ApiKeyCategory.ELEVENLABS,
    );
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'The platform ElevenLabs connection is unavailable.',
      );
    }
    return {
      apiKey,
      binding: {
        credentialVersionId: 'platform',
        kind: 'platform',
        organizationId,
        provider: 'elevenlabs',
      },
    };
  }
}
