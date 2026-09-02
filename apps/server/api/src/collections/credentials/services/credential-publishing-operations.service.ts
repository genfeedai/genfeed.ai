import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { toCredentialPlatform } from '@api/collections/credentials/utils/credential-platform.util';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { QuotaService } from '@api/services/quota/quota.service';
import type { CredentialPlatform } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface CredentialMentionItem {
  avatar: string | null;
  handle: string;
  id: string;
  name: string;
  platform: CredentialPlatform;
}

@Injectable()
export class CredentialPublishingOperationsService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly organizationsService: OrganizationsService,
    private readonly quotaService: QuotaService,
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
}
