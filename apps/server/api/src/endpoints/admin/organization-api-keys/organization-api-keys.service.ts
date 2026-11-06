import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ApiKeyCategory } from '@genfeedai/contracts';
import {
  PARTNER_API_KEY_KIND,
  PARTNER_API_KEY_PERMISSION_LEVELS,
  readApiKeyAllowedBrandIds,
  resolveApiKeyPermissionScopes,
} from '@genfeedai/contracts/constants';
import type {
  ApiKeyPermissionLevels,
  IAdminPartnerApiKeyResult,
} from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface AdminPartnerApiKeyInput {
  allowedBrandIds?: string[];
  defaultBrandId?: string;
  description?: string;
  expiresInDays?: number;
  label: string;
  levels?: ApiKeyPermissionLevels;
  operatorUserId: string;
}

/**
 * Mints partner keys for a platform super admin. Partner keys carry scopes a
 * user cannot grant to their own key (`brands:write`), so they never go
 * through the self-service create endpoint. The key belongs to the
 * organization owner, like the managed key Stripe checkout mints.
 */
@Traced()
@Injectable()
export class AdminOrganizationApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async mintPartnerKey(
    organizationId: string,
    input: AdminPartnerApiKeyInput,
  ): Promise<IAdminPartnerApiKeyResult> {
    const scopes = resolveApiKeyPermissionScopes(
      input.levels ?? PARTNER_API_KEY_PERMISSION_LEVELS,
    );
    if (scopes.length === 0) {
      throw new BadRequestException('A partner key needs at least one scope');
    }

    // tenant-scope-ignore: Organization is looked up by id; the caller is a super admin behind the IP allow-list, and the key below is created in this organization.
    const organization = await this.prisma.organization.findFirst({
      select: { id: true, userId: true },
      where: { id: organizationId, isDeleted: false },
    });
    if (!organization) {
      throw new NotFoundException('Organization', organizationId);
    }

    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      : undefined;

    const { apiKey, plainKey } = await this.apiKeysService.createWithKey({
      allowedBrandIds: input.allowedBrandIds,
      category: ApiKeyCategory.GENFEEDAI,
      defaultBrandId: input.defaultBrandId,
      description: input.description,
      expiresAt,
      label: input.label,
      metadata: {
        kind: PARTNER_API_KEY_KIND,
        mintedByUserId: input.operatorUserId,
      },
      organizationId: organization.id,
      scopes,
      userId: organization.userId,
    });

    return {
      allowedBrandIds: readApiKeyAllowedBrandIds(apiKey.metadata) ?? null,
      apiKeyId: apiKey.id,
      defaultBrandId: apiKey.defaultBrandId ?? null,
      expiresAt: apiKey.expiresAt
        ? new Date(apiKey.expiresAt).toISOString()
        : null,
      key: plainKey,
      label: apiKey.label,
      organizationId: organization.id,
      scopes: apiKey.scopes,
      userId: organization.userId,
    };
  }
}
