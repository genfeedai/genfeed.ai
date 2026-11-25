import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { toCredentialPlatform } from '@api/collections/credentials/utils/credential-platform.util';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  InstagramAudioTrack,
  InstagramAudioType,
} from '@genfeedai/contracts/api-types/contracts/instagram-publishing.contract';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface CredentialMentionItem {
  avatar: string | null;
  handle: string;
  id: string;
  name: string;
  platform: CredentialPlatform;
}

@Traced()
@Injectable()
export class CredentialPublishingOperationsService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly organizationsService: OrganizationsService,
    private readonly quotaService: QuotaService,
    private readonly instagramService: InstagramService,
  ) {}

  async getMentions(
    organizationId: string,
  ): Promise<{ mentions: CredentialMentionItem[] }> {
    const credentials = await this.credentialsService.find({
      isConnected: true,
      organizationId,
    });

    const seen = new Set<string>();
    const mentions: CredentialMentionItem[] = [];
    for (const credential of credentials) {
      if (!credential.externalHandle) continue;
      const key = `${credential.externalHandle}:${credential.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push({
        avatar: credential.externalAvatar ?? null,
        handle: credential.externalHandle,
        id: credential.id.toString(),
        name: credential.externalName ?? credential.externalHandle,
        platform: toCredentialPlatform(credential.platform),
      });
    }

    return { mentions };
  }

  async getQuotaStatus(
    credentialId: string,
    organizationId: string,
  ): Promise<JsonApiSingleResponse> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'Credential not found',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });

    if (!organization) {
      throw new HttpException(
        {
          detail: 'Organization not found',
          title: 'Organization not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const quotaStatus = await this.quotaService.checkQuota(
      credential,
      organization,
    );

    return {
      data: {
        attributes: quotaStatus,
        id: credential.id.toString(),
        type: 'quota-status',
      },
    };
  }

  /**
   * Instagram's licensed-music catalogue, read with this credential's own
   * token. Returns the ids a Reel's `audioId` target setting accepts.
   */
  async listInstagramAudio(
    credentialId: string,
    organizationId: string,
    audioType: InstagramAudioType,
    searchQuery?: string,
  ): Promise<InstagramAudioTrack[]> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
      platform: CredentialPlatform.INSTAGRAM,
    });

    if (!credential?.accessToken || !credential.brandId) {
      throw new HttpException(
        {
          detail: 'Instagram account is not connected',
          title: 'Not Connected',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.instagramService.listAudio(
      organizationId,
      credential.brandId.toString(),
      audioType,
      searchQuery,
      credential.id.toString(),
    );
  }
}
