import { randomBytes } from 'node:crypto';
import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import type { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { CredentialPlatform, FileInputType } from '@genfeedai/enums';
import { TagCategory as PrismaTagCategory } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
type CredentialUpsertFields = Partial<
  Omit<
    CreateCredentialDto,
    'brandId' | 'organizationId' | 'platform' | 'userId'
  >
>;

function requireCredentialRelationId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} is required to persist a credential`);
  }

  return value;
}

export interface ExternalCredentialProfile {
  avatarUrl?: string | null;
  handle?: string | null;
  id?: string | null;
  name?: string | null;
}

export interface OAuthCredentialScope {
  organizationId: string;
  userId?: string;
}

export type PendingOAuthCredential = CredentialDocument & {
  brandId: string;
  organizationId: string;
  userId: string;
};

@Injectable()
export class CredentialsService extends BaseService<
  CredentialDocument,
  CreateCredentialDto,
  UpdateCredentialDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly cryptoService: CredentialCryptoService,
    private readonly filesClientService: FilesClientService,
  ) {
    super(prisma, 'credential', logger);
  }

  protected override normalizeData(data: unknown): Record<string, unknown> {
    const normalized = super.normalizeData(data) as Record<string, unknown>;
    const { tagIds, ...credentialData } = normalized;

    if (tagIds === undefined) {
      return credentialData;
    }

    if (
      !Array.isArray(tagIds) ||
      tagIds.some((tagId) => typeof tagId !== 'string')
    ) {
      throw new TypeError('tagIds must be an array of entity IDs');
    }

    const normalizedTagIds = tagIds.map((tagId) => tagId.trim());

    if (normalizedTagIds.some((tagId) => tagId.length === 0)) {
      throw new TypeError('tagIds must contain non-empty entity IDs');
    }

    return {
      ...credentialData,
      tags: {
        set: [...new Set(normalizedTagIds)].map((id) => ({ id })),
      },
    };
  }

  /**
   * Encrypt-on-write boundary. Every credential secret (access/refresh tokens
   * and token secrets) is encrypted here before it reaches the database — and
   * before `BaseService` logs the payload — so providers can persist tokens
   * without each having to remember to encrypt. Decryption stays explicit at
   * each read site (see `CredentialHelper.getDecryptedCredential`). The crypto
   * is idempotent, so values that arrive already encrypted are left untouched.
   */
  override async create(
    createDto: CreateCredentialDto,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    return super.create(
      this.cryptoService.encryptSecretFields(
        createDto as unknown as Record<string, unknown>,
      ) as unknown as CreateCredentialDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateCredentialDto> | Record<string, unknown>,
    populate: PopulateInput = [],
  ): Promise<CredentialDocument> {
    return super.patch(
      id,
      this.cryptoService.encryptSecretFields(
        updateDto as Record<string, unknown>,
      ),
      populate,
    );
  }

  override patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    return super.patchAll(
      filter,
      this.cryptoService.encryptSecretFields(update),
    );
  }

  /**
   * Atomically merge top-level keys into `warmupSignals` (Postgres `jsonb ||`).
   *
   * Several writers share this column — account-health assessments, TikTok
   * token refreshes, and authorized-signal snapshot persistence — each owning
   * distinct top-level keys. A read-modify-write `patch` replaces the whole
   * object and silently drops keys written concurrently by another writer, so
   * every partial `warmupSignals` write must go through this merge instead.
   */
  async mergeWarmupSignals(
    id: string,
    organizationId: string,
    signals: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "credentials"
      SET "warmupSignals" = COALESCE("warmupSignals", '{}'::jsonb) || ${JSON.stringify(signals)}::jsonb,
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "organizationId" = ${organizationId}
        AND "isDeleted" = false
    `;
  }

  countConnected(organizationId: string, brandId?: string): Promise<number> {
    return this.prisma.credential.count({
      where: scopedWhere(organizationId, {
        isConnected: true,
        ...(brandId ? { brandId } : {}),
      }),
    });
  }

  findByHandle(
    handle: string,
    organizationId: string,
  ): Promise<CredentialDocument | null> {
    const normalizedHandle = handle.replace(/^@/, '');

    return this.findOne(
      scopedWhere(organizationId, {
        externalHandle: { contains: normalizedHandle, mode: 'insensitive' },
        isConnected: true,
      }),
    );
  }

  async upsertForBrand(
    brand: {
      id: string;
      organizationId: string;
      [key: string]: unknown;
    },
    userId: string,
    platform: CredentialPlatform,
    fields: CredentialUpsertFields,
  ): Promise<CredentialDocument> {
    const brandId = requireCredentialRelationId(brand.id, 'brandId');
    const organizationId = requireCredentialRelationId(
      brand.organizationId,
      'organizationId',
    );
    const credentialUserId = requireCredentialRelationId(userId, 'userId');

    const existing = await this.findOne({
      brandId,
      organizationId,
      platform,
    });

    const credentialData = {
      ...fields,
      brandId,
      organizationId,
      platform,
      userId: credentialUserId,
    };

    if (existing) {
      return this.patch(existing.id, {
        ...credentialData,
        isDeleted: false,
      });
    }

    return this.create(credentialData as unknown as CreateCredentialDto);
  }

  /**
   * Start an OAuth connection with an opaque, credential-bound CSRF nonce.
   * Provider callbacks receive no tenant identifiers they can tamper with;
   * the pending credential remains the authoritative source of scope.
   */
  async beginOAuthForBrand(
    brand: {
      id: string;
      organizationId: string;
      [key: string]: unknown;
    },
    userId: string,
    platform: CredentialPlatform,
    fields: CredentialUpsertFields = {},
  ): Promise<{ credential: CredentialDocument; state: string }> {
    const state = randomBytes(32).toString('base64url');
    const credential = await this.upsertForBrand(brand, userId, platform, {
      ...fields,
      oauthState: state,
    });

    return { credential, state };
  }

  /** Resolve a pending OAuth nonce within the authenticated tenant scope. */
  async findPendingOAuthCredential(
    state: string,
    platform: CredentialPlatform,
    scope?: Partial<OAuthCredentialScope>,
  ): Promise<PendingOAuthCredential | null> {
    if (typeof state !== 'string' || !state.trim()) {
      return null;
    }

    const credential = await this.findOne({
      oauthState: state,
      platform,
      updatedAt: { gte: new Date(Date.now() - OAUTH_STATE_TTL_MS) },
      ...(scope?.organizationId
        ? {
            organizationId: requireCredentialRelationId(
              scope.organizationId,
              'organizationId',
            ),
          }
        : {}),
      ...(scope?.userId
        ? {
            userId: requireCredentialRelationId(scope.userId, 'userId'),
          }
        : {}),
    });

    if (
      !credential?.brandId ||
      !credential.organizationId ||
      !credential.userId
    ) {
      return null;
    }

    return credential as PendingOAuthCredential;
  }

  /**
   * Create a credential-scoped tag and attach it atomically. The credential
   * lookup and relation write are both tenant-scoped so a leaked credential ID
   * cannot create or attach data in another organization.
   */
  createAndAttachTag(
    credentialId: string,
    organizationId: string,
    userId: string,
    createTagDto: CreateTagDto,
  ): Promise<CredentialDocument> {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.credential.findFirst({
        select: { brandId: true, id: true },
        where: {
          id: credentialId,
          isDeleted: false,
          organizationId,
        },
      });

      if (!credential) {
        throw new NotFoundException('Credential', credentialId);
      }

      const tag = await tx.tag.create({
        data: {
          ...(createTagDto.backgroundColor !== undefined && {
            backgroundColor: createTagDto.backgroundColor,
          }),
          brandId: credential.brandId,
          category: PrismaTagCategory.CREDENTIAL,
          ...(createTagDto.description !== undefined && {
            description: createTagDto.description,
          }),
          ...(createTagDto.key !== undefined && { key: createTagDto.key }),
          label: createTagDto.label,
          organizationId,
          ...(createTagDto.textColor !== undefined && {
            textColor: createTagDto.textColor,
          }),
          userId,
        },
        select: { id: true },
      });

      return tx.credential.update({
        data: { tags: { connect: { id: tag.id } } },
        include: { tags: true },
        where: {
          id: credential.id,
          isDeleted: false,
          organizationId,
        },
      });
    });
  }

  /**
   * Persist public provider identity and mirror its avatar into Genfeed-owned
   * storage. OAuth remains successful when avatar import fails; in that case
   * the previous S3 avatar is preserved and the UI uses its fallback.
   */
  async updateExternalProfile(
    credentialId: string,
    organizationId: string,
    profile: ExternalCredentialProfile,
  ): Promise<CredentialDocument> {
    const credential = await this.findOne({
      id: credentialId,
      organizationId: organizationId,
    });

    if (!credential) {
      throw new Error(`Credential ${credentialId} not found`);
    }

    const update: Record<string, string> = {};

    if (profile.handle) {
      update.externalHandle = profile.handle;
    }
    if (profile.id) {
      update.externalId = profile.id;
    }
    if (profile.name) {
      update.externalName = profile.name;
    }

    if (profile.avatarUrl) {
      try {
        const parsedAvatarUrl = new URL(profile.avatarUrl);
        if (!['http:', 'https:'].includes(parsedAvatarUrl.protocol)) {
          throw new Error('Credential avatar URL must use http or https');
        }
        assertUrlNotPrivate(profile.avatarUrl);
        const metadata = await this.filesClientService.uploadToS3(
          credentialId,
          'social-avatars',
          {
            type: FileInputType.URL,
            url: profile.avatarUrl,
          },
        );

        if (metadata.publicUrl) {
          update.externalAvatar = metadata.publicUrl;
        }
      } catch (error: unknown) {
        this.logger.warn('Failed to import credential avatar', {
          credentialId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (Object.keys(update).length === 0) {
      return credential;
    }

    return this.patch(credential.id, update);
  }
}
