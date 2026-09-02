import { randomBytes, randomInt } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import { ApiKeyCategory, PlatformRole } from '@genfeedai/enums';
import { hasApiAccess } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CompleteAgentAuthClaimDto,
  ExchangeAgentAuthClaimDto,
  InspectAgentAuthClaimDto,
  RegisterAgentAuthDto,
  RevokeAgentAuthCredentialDto,
} from '../dto/agent-auth.dto';

const AGENT_AUTH_REGISTRATION_TTL_MS = 10 * 60 * 1000;
const AGENT_AUTH_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AGENT_AUTH_POLL_INTERVAL_SECONDS = 5;
const MAX_FAILED_CLAIM_ATTEMPTS = 5;
const MAX_ACTIVE_API_KEYS = 10;

type AgentAuthRegistrationRecord = {
  claimAttemptTokenHash: string;
  claimTokenHash: string;
  claimedAt: Date | null;
  emailHash: string;
  exchangedAt: Date | null;
  expiresAt: Date;
  failedAttempts: number;
  id: string;
  organizationId: string | null;
  requestedScopes: string[];
  revokedAt: Date | null;
  userCodeHash: string;
  userId: string | null;
};

function agentAuthError(
  error: string,
  description: string,
): BadRequestException {
  return new BadRequestException({
    error,
    error_description: description,
  });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function readApiKeyMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : undefined;
}

@Injectable()
export class AgentAuthService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterAgentAuthDto) {
    const email = normalizeEmail(
      dto.type === 'identity_assertion'
        ? (dto.assertion ?? '')
        : (dto.login_hint ?? ''),
    );
    if (!email) {
      throw agentAuthError(
        'invalid_request',
        'A verified email assertion or login hint is required.',
      );
    }

    const requestedScopes = Array.from(
      new Set(dto.requested_scopes ?? API_KEY_SCOPE_PRESETS.mcp),
    );
    const claimToken = toBase64Url(randomBytes(32));
    const claimAttemptToken = toBase64Url(randomBytes(32));
    const userCode = randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + AGENT_AUTH_REGISTRATION_TTL_MS);

    // sql-risk-audit: ignore bulk-write-tenant-review -- Global cleanup only removes expired one-time public registration ceremonies.
    await this.prisma.agentAuthRegistration.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });

    const registration = await this.prisma.agentAuthRegistration.create({
      data: {
        claimAttemptTokenHash: hashToken(claimAttemptToken),
        claimTokenHash: hashToken(claimToken),
        emailHash: hashToken(email),
        expiresAt,
        requestedScopes,
        userCodeHash: hashToken(userCode),
      },
    });

    const verificationUrl = new URL(
      '/agent-auth/claim',
      `${this.resolveAppUrl()}/`,
    );
    verificationUrl.searchParams.set('claim_attempt_token', claimAttemptToken);

    return {
      claim: {
        expires_in: Math.floor(AGENT_AUTH_REGISTRATION_TTL_MS / 1000),
        interval: AGENT_AUTH_POLL_INTERVAL_SECONDS,
        user_code: userCode,
        verification_uri: verificationUrl.toString(),
      },
      claim_token: claimToken,
      claim_token_expires: expiresAt.toISOString(),
      post_claim_scopes: requestedScopes,
      registration_id: registration.id,
      registration_type:
        dto.type === 'service_auth' ? 'service_auth' : 'verified_email',
    };
  }

  async completeClaim(
    authenticatedUser: AuthenticatedUser,
    dto: CompleteAgentAuthClaimDto,
  ): Promise<{ status: 'claimed' }> {
    const registration = await this.findByClaimAttemptToken(
      dto.claim_attempt_token,
    );
    this.assertActive(registration);

    if (registration.failedAttempts >= MAX_FAILED_CLAIM_ATTEMPTS) {
      throw new GoneException('Claim attempt limit exceeded. Register again.');
    }

    if (registration.userCodeHash !== hashToken(dto.user_code)) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- Pre-claim registrations are global by design; the unique registration id plus unclaimed/unexchanged state bounds this atomic attempt counter to one ceremony.
      await this.prisma.agentAuthRegistration.updateMany({
        data: { failedAttempts: { increment: 1 } },
        where: {
          claimedAt: null,
          exchangedAt: null,
          id: registration.id,
          revokedAt: null,
        },
      });
      throw new UnauthorizedException('Invalid claim code');
    }

    const userId = authenticatedUser.userId;
    const organizationId = authenticatedUser.organizationId;
    const authenticatedEmailHashes =
      authenticatedUser.emailAddresses?.flatMap((entry) =>
        typeof entry.emailAddress === 'string'
          ? [hashToken(normalizeEmail(entry.emailAddress))]
          : [],
      ) ?? [];
    if (
      !userId ||
      !organizationId ||
      !authenticatedEmailHashes.includes(registration.emailHash)
    ) {
      throw new UnauthorizedException(
        'The signed-in verified email does not match this claim.',
      );
    }

    const canonicalUser = await this.prisma.user.findFirst({
      select: { email: true, emailVerified: true },
      where: {
        emailVerified: true,
        id: userId,
        isDeleted: false,
      },
    });
    if (
      !canonicalUser?.email ||
      hashToken(normalizeEmail(canonicalUser.email)) !== registration.emailHash
    ) {
      throw new UnauthorizedException(
        'The signed-in verified email does not match this claim.',
      );
    }

    // sql-risk-audit: ignore bulk-write-tenant-review -- Pre-claim registrations have no tenant yet; the unique registration id, verified-email match, expiry, and unclaimed state bound this ownership transition to one ceremony.
    const claimResult = await this.prisma.agentAuthRegistration.updateMany({
      data: {
        claimedAt: new Date(),
        organizationId,
        userId,
      },
      where: {
        claimedAt: null,
        exchangedAt: null,
        expiresAt: { gt: new Date() },
        id: registration.id,
        revokedAt: null,
      },
    });
    if (claimResult.count !== 1) {
      throw new GoneException('This claim is no longer available.');
    }

    return { status: 'claimed' };
  }

  async inspectClaim(dto: InspectAgentAuthClaimDto) {
    const registration = await this.findByClaimAttemptToken(
      dto.claim_attempt_token,
    );
    this.assertActive(registration);

    return {
      expires_at: registration.expiresAt.toISOString(),
      requested_scopes: registration.requestedScopes,
      status: registration.claimedAt ? 'claimed' : 'pending',
    };
  }

  async exchangeClaim(dto: ExchangeAgentAuthClaimDto) {
    const registration = await this.findByClaimToken(dto.claim_token);
    this.assertActive(registration);

    if (
      !registration.claimedAt ||
      !registration.userId ||
      !registration.organizationId
    ) {
      throw agentAuthError(
        'authorization_pending',
        'The user has not completed the claim ceremony.',
      );
    }
    if (registration.exchangedAt) {
      throw agentAuthError(
        'invalid_grant',
        'This claim was already exchanged.',
      );
    }

    await this.assertApiAccess(
      registration.userId,
      registration.organizationId,
    );
    const activeKeyCount = await this.prisma.apiKey.count({
      where: {
        isRevoked: false,
        organizationId: registration.organizationId,
        userId: registration.userId,
      },
    });
    if (activeKeyCount >= MAX_ACTIVE_API_KEYS) {
      throw agentAuthError(
        'credential_limit_reached',
        'The user has reached the maximum number of active API keys.',
      );
    }

    const exchangeReservedAt = new Date();
    const consumeResult = await this.prisma.agentAuthRegistration.updateMany({
      data: { exchangedAt: exchangeReservedAt },
      where: {
        claimedAt: registration.claimedAt,
        exchangedAt: null,
        expiresAt: { gt: new Date() },
        id: registration.id,
        organizationId: registration.organizationId,
        revokedAt: null,
        userId: registration.userId,
      },
    });
    if (consumeResult.count !== 1) {
      throw agentAuthError(
        'invalid_grant',
        'This claim was already exchanged.',
      );
    }

    const expiresAt = new Date(Date.now() + AGENT_AUTH_CREDENTIAL_TTL_MS);
    let createdCredential: Awaited<ReturnType<ApiKeysService['createWithKey']>>;
    try {
      createdCredential = await this.apiKeysService.createWithKey({
        category: ApiKeyCategory.GENFEEDAI,
        description: 'Credential issued through Auth.md agent registration',
        expiresAt: expiresAt.toISOString(),
        label: 'Agent registration',
        metadata: {
          kind: 'agent-auth-registration',
          registrationId: registration.id,
        },
        organizationId: registration.organizationId,
        rateLimit: 120,
        scopes: registration.requestedScopes,
        userId: registration.userId,
      });
    } catch (error) {
      await this.prisma.agentAuthRegistration.updateMany({
        data: { exchangedAt: null },
        where: {
          exchangedAt: exchangeReservedAt,
          id: registration.id,
          organizationId: registration.organizationId,
          revokedAt: null,
          userId: registration.userId,
        },
      });
      throw error;
    }
    const { apiKey, plainKey } = createdCredential;
    const persistedExpiry = apiKey.expiresAt ?? expiresAt;

    return {
      credential: plainKey,
      credential_expires: persistedExpiry.toISOString(),
      credential_type: 'api_key',
      scopes: registration.requestedScopes,
    };
  }

  async revokeCredential(
    dto: RevokeAgentAuthCredentialDto,
  ): Promise<{ revoked: boolean }> {
    const apiKey = await this.apiKeysService.findByKey(dto.token);
    if (!apiKey) {
      return { revoked: true };
    }

    const metadata = readApiKeyMetadata(apiKey.metadata);
    if (metadata?.kind !== 'agent-auth-registration') {
      return { revoked: false };
    }

    await this.apiKeysService.revoke(apiKey.id);
    if (typeof metadata.registrationId === 'string') {
      await this.prisma.agentAuthRegistration.updateMany({
        data: { revokedAt: new Date() },
        where: {
          id: metadata.registrationId,
          organizationId: apiKey.organizationId,
          revokedAt: null,
          userId: apiKey.userId,
        },
      });
    }
    return { revoked: true };
  }

  private async findByClaimAttemptToken(
    token: string,
  ): Promise<AgentAuthRegistrationRecord> {
    const registration = await this.prisma.agentAuthRegistration.findUnique({
      where: { claimAttemptTokenHash: hashToken(token) },
    });
    if (!registration) {
      throw new GoneException('Invalid or expired claim attempt.');
    }
    return registration as AgentAuthRegistrationRecord;
  }

  private async findByClaimToken(
    token: string,
  ): Promise<AgentAuthRegistrationRecord> {
    const registration = await this.prisma.agentAuthRegistration.findUnique({
      where: { claimTokenHash: hashToken(token) },
    });
    if (!registration) {
      throw agentAuthError('invalid_claim_token', 'Invalid claim token.');
    }
    return registration as AgentAuthRegistrationRecord;
  }

  private assertActive(registration: AgentAuthRegistrationRecord): void {
    if (registration.revokedAt || registration.expiresAt <= new Date()) {
      throw new GoneException('This registration expired or was revoked.');
    }
  }

  private async assertApiAccess(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    if (!isCloudDeployment()) {
      return;
    }

    const [user, setting] = await Promise.all([
      this.prisma.user.findFirst({
        select: { platformRole: true },
        where: { id: userId, isDeleted: false },
      }),
      this.prisma.organizationSetting.findUnique({
        select: { subscriptionTier: true },
        where: { organizationId },
      }),
    ]);
    if (
      user?.platformRole !== PlatformRole.SUPERADMIN &&
      !hasApiAccess(setting?.subscriptionTier)
    ) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_EXCEEDED',
        detail:
          'API access is available on paid plans. Upgrade to Pro before authorizing an agent.',
        title: 'API access requires a paid plan',
      });
    }
  }

  private resolveAppUrl(): string {
    const configured = this.configService.get('GENFEEDAI_APP_URL');
    return typeof configured === 'string' && configured.length > 0
      ? configured.replace(/\/+$/, '')
      : 'http://localhost:3000';
  }
}
