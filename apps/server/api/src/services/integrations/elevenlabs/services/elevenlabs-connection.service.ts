import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { ElevenLabsConnectionRef } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface ResolvedElevenLabsConnection {
  apiKey: string;
  binding: ElevenLabsConnectionRef & { credentialVersionId: string };
}

/**
 * Resolves the ElevenLabs account a request runs on: always the
 * organization's own. Genfeed holds no ElevenLabs account that speaks or
 * clones for customers.
 */
@Traced()
@Injectable()
export class ElevenLabsConnectionService {
  constructor(private readonly byokService: ByokService) {}

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

  async resolve(organizationId: string): Promise<ResolvedElevenLabsConnection> {
    const connection = await this.findPersonalConnection(organizationId);
    if (!connection) {
      throw new BadRequestException(
        'Connect your ElevenLabs account in Settings → Integrations to use ElevenLabs voices.',
      );
    }
    return connection;
  }
}
