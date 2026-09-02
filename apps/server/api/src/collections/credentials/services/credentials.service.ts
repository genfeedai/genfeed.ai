import { createHash, randomBytes } from 'node:crypto';
import { OAUTH_STATE_TTL_MS } from '@api/collections/credentials/constants/oauth.constants';
import type {
  CredentialDocument,
  ResolveBrandAccountOptions,
} from '@api/collections/credentials/credential.types';
import type { ServerCredentialStore } from '@api/collections/credentials/credentials.port';
import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import type { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import {
  CredentialPlatform,
  FileInputType,
  fromPrismaCredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import { Prisma, TagCategory as PrismaTagCategory } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type { ResolveBrandAccountOptions } from '@api/collections/credentials/credential.types';

function hashOAuthRequestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Columns that describe *this connection* rather than *this account*. When a
 * reconnect resolves to an account the brand already holds, these move onto the
 * incumbent row; everything else it owns — label, description, posting times,
 * warm-up state, tags, and every row that foreign-keys to its id — stays put.
 */
const CARRIED_CONNECTION_COLUMNS = [
  'accessToken',
  'accessTokenExpiry',
  'accessTokenSecret',
  'grantedScopes',
  'grantedScopesCapturedAt',
  'oauthToken',
  'oauthTokenHash',
  'oauthTokenSecret',
  'refreshToken',
  'refreshTokenExpiry',
  'userId',
  'username',
] as const;

/** Postgres reports a partial-unique collision as Prisma error P2002. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

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
export class CredentialsService
  extends BaseService<
    CredentialDocument,
    CreateCredentialDto,
    UpdateCredentialDto
  >
  implements ServerCredentialStore
{
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
   * Prisma stores `credentials.platform` as SCREAMING enum labels.
   * Domain `ICredential.platform` / API JSON stay product-lowercase.
   */
  protected override normalizeDocument(document: unknown): CredentialDocument {
    const normalized = super.normalizeDocument(document) as Record<
      string,
      unknown
    >;
    if (typeof normalized.platform === 'string') {
      const domainPlatform = fromPrismaCredentialPlatform(normalized.platform);
      if (domainPlatform) {
        normalized.platform = domainPlatform;
      }
    }
    return normalized as unknown as CredentialDocument;
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

  /**
   * Irreversibly remove provider-derived identity and connection material after
   * an authenticated provider deauthorization or data-deletion callback.
   *
   * This is intentionally the only cross-tenant credential mutation in this
   * service. The provider's app-scoped user id carries no organization id, so
   * callers must authenticate the provider-signed request before invoking it.
   * The `(platform, externalId)` pair is the narrow global identity boundary.
   * User-authored schedules and content remain attached to a sanitized,
   * soft-deleted credential so existing foreign keys are preserved.
   */
  async purgeProviderAccount(
    platform: CredentialPlatform,
    externalId: string,
  ): Promise<number> {
    const prismaPlatform = toPrismaCredentialPlatform(platform);
    if (!prismaPlatform || !externalId.trim()) {
      throw new TypeError('A persisted platform and external id are required');
    }

    return this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: Meta's verified app-scoped user id is the global identity boundary; the signed callback contains no organization id
      const credentials = await tx.credential.findMany({
        select: { id: true },
        where: {
          externalId: externalId.trim(),
          platform: prismaPlatform,
        },
      });
      const credentialIds = credentials.map(({ id }) => id);

      if (credentialIds.length === 0) {
        return 0;
      }

      // Analytics and provider publication identifiers were obtained from the
      // provider. Preserve the user's authored post, but remove those fields.
      // sql-risk-audit: ignore bulk-write-tenant-review -- credentialIds come only from the verified global provider identity lookup and cover live and deleted rows across organizations.
      await tx.postAnalytics.deleteMany({
        where: {
          platform: prismaPlatform,
          post: { credentialId: { in: credentialIds } },
        },
      });
      // tenant-scope-ignore: credentialIds come only from the verified global provider identity lookup and intentionally cover live and deleted rows across organizations
      // sql-risk-audit: ignore bulk-write-tenant-review -- same credentialIds bound the write; provider identity is global, not org-scoped.
      await tx.post.updateMany({
        data: {
          analyticsCollectedAt: null,
          analyticsCollectionAttemptKey: null,
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionRequestedAt: null,
          analyticsCollectionState: 'unavailable',
          externalId: null,
          externalShortcode: null,
          url: null,
        },
        where: {
          credentialId: { in: credentialIds },
          platform,
        },
      });

      // tenant-scope-ignore: credentialIds come only from the verified global provider identity lookup and intentionally sanitize live and deleted credentials across organizations
      // sql-risk-audit: ignore bulk-write-tenant-review -- same credentialIds bound the write; provider identity is global, not org-scoped.
      const result = await tx.credential.updateMany({
        data: {
          accessToken: null,
          accessTokenExpiry: null,
          accessTokenSecret: null,
          externalAvatar: null,
          externalHandle: null,
          externalId: null,
          externalName: null,
          grantedScopes: [],
          grantedScopesCapturedAt: null,
          isConnected: false,
          isDeleted: true,
          oauthState: null,
          oauthToken: null,
          oauthTokenHash: null,
          oauthTokenSecret: null,
          refreshToken: null,
          refreshTokenExpiry: null,
          username: null,
          warmupAssessedAt: null,
          warmupHoldReason: null,
          warmupRiskLevel: 'unknown',
          warmupScore: 0,
          warmupSignals: {},
          warmupState: 'not_started',
        },
        where: {
          id: { in: credentialIds },
          platform: prismaPlatform,
        },
      });

      return result.count;
    });
  }

  /**
   * Provision a fresh, unidentified credential for an in-flight connection.
   *
   * Connect deliberately does not look at the accounts this brand already holds
   * on the platform. Which account is being authorized is decided later, inside
   * the provider's own consent screen, so any row chosen here would be a guess —
   * and the old guess ("the one existing row") overwrote a working account's
   * tokens before the operator had even chosen, including when they abandoned
   * the consent screen. Identity is resolved after the callback, by
   * `updateExternalProfile`.
   */
  async createPendingForBrand(
    brand: {
      id: string;
      organizationId: string;
      [key: string]: unknown;
    },
    userId: string,
    platform: CredentialPlatform,
    fields: CredentialUpsertFields = {},
  ): Promise<CredentialDocument> {
    const brandId = requireCredentialRelationId(brand.id, 'brandId');
    const organizationId = requireCredentialRelationId(
      brand.organizationId,
      'organizationId',
    );
    const credentialUserId = requireCredentialRelationId(userId, 'userId');

    await this.reapStalePendingCredentials(
      brandId,
      organizationId,
      credentialUserId,
      platform,
    );

    return this.create({
      ...fields,
      brandId,
      externalId: null,
      isConnected: false,
      isDeleted: false,
      organizationId,
      platform,
      userId: credentialUserId,
    } as unknown as CreateCredentialDto);
  }

  /**
   * Retire the caller's own abandoned connect attempts for this brand and
   * platform so they cannot accumulate. Only rows that never reached the
   * provider callback qualify: unidentified, unconnected, and older than the
   * OAuth state TTL.
   */
  private async reapStalePendingCredentials(
    brandId: string,
    organizationId: string,
    userId: string,
    platform: CredentialPlatform,
  ): Promise<void> {
    const prismaPlatform = toPrismaCredentialPlatform(platform);

    if (!prismaPlatform) {
      return;
    }

    await this.prisma.credential.updateMany({
      data: { isDeleted: true, oauthState: null, oauthToken: null },
      where: {
        brandId,
        externalId: null,
        isConnected: false,
        isDeleted: false,
        organizationId,
        platform: prismaPlatform,
        updatedAt: { lt: new Date(Date.now() - OAUTH_STATE_TTL_MS) },
        userId,
      },
    });
  }

  /**
   * Every live connected account this brand holds on a platform, oldest first.
   *
   * Callers that act *as* an account take an explicit credential id. Callers
   * that publish *for* a brand fan out over this list — resolving a single
   * account from brand + platform alone is a silent wrong-account defect once a
   * brand runs more than one.
   */
  async findConnectedAccounts(
    organizationId: string,
    brandId: string,
    platform: CredentialPlatform,
  ): Promise<CredentialDocument[]> {
    const accounts = await this.find({
      brandId,
      isConnected: true,
      organizationId,
      platform,
    });

    return CredentialsService.oldestFirst(accounts);
  }

  /**
   * Oldest first — the tie-break that makes "the brand's default account"
   * deterministic instead of "whatever row the database returned".
   */
  private static oldestFirst(
    accounts: CredentialDocument[],
  ): CredentialDocument[] {
    return [...accounts].sort(
      (first, second) =>
        new Date(first.createdAt ?? 0).getTime() -
        new Date(second.createdAt ?? 0).getTime(),
    );
  }

  /**
   * The one account a brand-scoped operation should act as on a platform.
   *
   * An explicit `credentialId` always wins and is verified to belong to this
   * brand and platform — an id from another brand, tenant, or platform resolves
   * to nothing rather than to a neighbour's account. Without one this falls
   * back to the brand's *oldest* connected account so the choice is at least
   * deterministic, and warns whenever that fallback had more than one row to
   * choose from: an implicit pick is a wrong-account defect waiting for the
   * brand to connect its second handle.
   *
   * Callers that already hold the account — publishers reading
   * `PublishContext.credential`, anything addressing a credential by id — must
   * use it directly instead of calling this.
   */
  async resolveBrandAccount(
    options: ResolveBrandAccountOptions,
  ): Promise<CredentialDocument | null> {
    const {
      brandId,
      credentialId,
      isDisconnectedIncluded = false,
      organizationId,
      platform,
    } = options;

    if (credentialId) {
      const named = await this.findOne({ id: credentialId, organizationId });

      if (!named) {
        return null;
      }

      if (
        named.brandId !== brandId ||
        fromPrismaCredentialPlatform(named.platform) !== platform
      ) {
        this.logger.warn(
          `${CredentialsService.name} credential ${credentialId} does not belong to this brand on ${platform}`,
          { brandId, credentialId, organizationId, platform },
        );
        return null;
      }

      return named;
    }

    const accounts = isDisconnectedIncluded
      ? await this.findBrandAccounts(organizationId, brandId, platform)
      : await this.findConnectedAccounts(organizationId, brandId, platform);

    const account = accounts[0] ?? null;

    if (accounts.length > 1 && account) {
      this.logger.warn(
        `${CredentialsService.name} resolved a brand default because no credential id was supplied and the brand holds ${accounts.length} ${platform} accounts`,
        {
          brandId,
          credentialId: account.id,
          organizationId,
          platform,
        },
      );
    }

    return account;
  }

  /**
   * Every live account row this brand holds on a platform, connected or not,
   * oldest first. Reconnect and token-repair paths read this; publishing reads
   * `findConnectedAccounts`.
   */
  async findBrandAccounts(
    organizationId: string,
    brandId: string,
    platform: CredentialPlatform,
  ): Promise<CredentialDocument[]> {
    const accounts = await this.find({ brandId, organizationId, platform });

    return CredentialsService.oldestFirst(accounts);
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
    const credential = await this.createPendingForBrand(
      brand,
      userId,
      platform,
      { ...fields, oauthState: state },
    );

    return { credential, state };
  }

  /**
   * Attach an OAuth 1.0a request-token pair to its pending credential.
   *
   * The tokens pass through the centralized encrypt-on-write boundary. A
   * one-way hash remains queryable for the provider callback without making
   * either temporary secret searchable in plaintext.
   */
  async attachOAuth1RequestToken(
    credentialId: string,
    platform: CredentialPlatform,
    scope: OAuthCredentialScope,
    oauthToken: string,
    oauthTokenSecret: string,
  ): Promise<void> {
    const { modifiedCount } = await this.patchAll(
      {
        id: credentialId,
        isConnected: false,
        organizationId: requireCredentialRelationId(
          scope.organizationId,
          'organizationId',
        ),
        platform,
        userId: requireCredentialRelationId(scope.userId, 'userId'),
      },
      {
        oauthToken,
        oauthTokenHash: hashOAuthRequestToken(oauthToken),
        oauthTokenSecret,
      },
    );

    if (modifiedCount !== 1) {
      throw new NotFoundException('Pending credential', credentialId);
    }
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
   * Resolve an OAuth 1.0a callback through its provider-issued request token.
   * The lookup remains TTL-bound and tenant/user scoped, preventing a token
   * copied from another session from attaching credentials across accounts.
   */
  async findPendingOAuth1Credential(
    oauthToken: string,
    platform: CredentialPlatform,
    scope: OAuthCredentialScope,
  ): Promise<PendingOAuthCredential | null> {
    if (typeof oauthToken !== 'string' || !oauthToken.trim()) {
      return null;
    }

    const credential = await this.findOne({
      isConnected: false,
      oauthTokenHash: hashOAuthRequestToken(oauthToken),
      organizationId: requireCredentialRelationId(
        scope.organizationId,
        'organizationId',
      ),
      platform,
      updatedAt: { gte: new Date(Date.now() - OAUTH_STATE_TTL_MS) },
      userId: requireCredentialRelationId(scope.userId, 'userId'),
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
   * Persist an exchanged connection and settle which account it belongs to.
   *
   * One call rather than two so a verify cannot write tokens under one step and
   * identity under another, leaving a connected-but-unidentifiable row behind
   * when the second step fails.
   */
  async connectAccount(
    credentialId: string,
    organizationId: string,
    profile: ExternalCredentialProfile,
    connection: Record<string, unknown> = {},
  ): Promise<CredentialDocument> {
    if (Object.keys(connection).length > 0) {
      await this.patch(credentialId, {
        ...connection,
        isConnected: true,
        isDeleted: false,
        oauthState: null,
      });
    }

    return this.updateExternalProfile(credentialId, organizationId, profile);
  }

  /**
   * Persist public provider identity, mirror its avatar into Genfeed-owned
   * storage, and reconcile the row against the accounts this brand already
   * holds on the platform.
   *
   * This is the only place `externalId` is written, which makes it the only
   * safe moment to settle account identity: the provider has just told us
   * *which* account was authorized, something connect could not know. A brand
   * may hold many accounts on one platform, so the answer decides whether this
   * connection is a reconnect of an existing account or a new one.
   *
   * OAuth remains successful when avatar import fails; in that case the
   * previous S3 avatar is preserved and the UI uses its fallback.
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

    const externalId =
      update.externalId ?? (credential.externalId as string | null) ?? null;

    if (!externalId) {
      // Persisting an unidentifiable account would recreate the ambiguity this
      // whole flow exists to remove: nothing downstream could tell it apart
      // from its siblings, and the next reconnect could not find it.
      throw new ValidationException(
        'The provider did not identify which account was authorized, so the connection was not saved. Please try connecting again.',
        'externalId',
      );
    }

    return this.reconcileConnectedAccount(credential, externalId, update);
  }

  /**
   * Settle `(brandId, platform, externalId)` into exactly one live credential.
   *
   * Same identity as an existing account → the incumbent survives with the new
   * connection merged in, so its id, posts, schedules, and warm-up history are
   * untouched and a reconnect stays idempotent. New identity → this row becomes
   * an additional account alongside its siblings.
   */
  private async reconcileConnectedAccount(
    credential: CredentialDocument,
    externalId: string,
    profileUpdate: Record<string, string>,
  ): Promise<CredentialDocument> {
    const brandId = credential.brandId as string | null | undefined;
    const prismaPlatform = toPrismaCredentialPlatform(
      credential.platform as CredentialPlatform,
    );

    const claimIdentity = (): Promise<CredentialDocument> =>
      this.patch(credential.id, {
        ...profileUpdate,
        externalId,
        isConnected: true,
        isDeleted: false,
        oauthState: null,
      });

    if (!brandId || !prismaPlatform) {
      // No brand or no persisted platform means no sibling set to reconcile
      // against — there is nothing this row could collide with.
      return claimIdentity();
    }

    const organizationId = requireCredentialRelationId(
      credential.organizationId,
      'organizationId',
    );

    const mergeIntoIncumbent = async (): Promise<CredentialDocument | null> =>
      this.prisma.$transaction(async (tx) => {
        const incumbent = await tx.credential.findFirst({
          select: { id: true },
          where: scopedWhere(organizationId, {
            brandId,
            externalId,
            id: { not: credential.id },
            platform: prismaPlatform,
          }),
        });

        if (!incumbent) {
          return null;
        }

        const survivor = await tx.credential.update({
          data: {
            ...this.carriedConnectionColumns(credential),
            ...profileUpdate,
            externalId,
            isConnected: true,
            isDeleted: false,
            oauthState: null,
          },
          where: scopedWhere(organizationId, { id: incumbent.id }),
        });

        // The just-authorized row has handed over everything that matters.
        // Retire it softly — a foreign key may already point at it.
        await tx.credential.update({
          data: { isConnected: false, isDeleted: true, oauthState: null },
          where: scopedWhere(organizationId, { id: credential.id }),
        });

        return this.normalizeDocument(survivor);
      });

    const merged = await mergeIntoIncumbent();

    if (merged) {
      return merged;
    }

    try {
      return await claimIdentity();
    } catch (error: unknown) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      // A concurrent verify — a double-clicked consent, or a provider that
      // delivered its callback twice — claimed this identity first. Fold into
      // the winner rather than leaving the operator with a failed reconnect.
      const survivor = await mergeIntoIncumbent();

      if (!survivor) {
        throw error;
      }

      return survivor;
    }
  }

  /** Connection-bearing columns to move onto a surviving incumbent row. */
  private carriedConnectionColumns(
    credential: CredentialDocument,
  ): Record<string, unknown> {
    const source = credential as unknown as Record<string, unknown>;

    return CARRIED_CONNECTION_COLUMNS.reduce<Record<string, unknown>>(
      (carried, column) => {
        if (source[column] !== undefined) {
          carried[column] = source[column];
        }

        return carried;
      },
      {},
    );
  }
}
