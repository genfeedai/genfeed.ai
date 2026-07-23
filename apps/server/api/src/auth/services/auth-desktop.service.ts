import { randomBytes } from 'node:crypto';
import type {
  CreateDesktopAuthCodeDto,
  ExchangeDesktopAuthCodeDto,
} from '@api/auth/dto/desktop-auth.dto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  buildCodeChallenge,
  hashToken,
  safeEqual,
  toBase64Url,
} from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin, ApiKeyCategory, ApiKeyScope } from '@genfeedai/enums';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const DESKTOP_AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const DESKTOP_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const DESKTOP_STANDARD_SCOPES: string[] = [
  ApiKeyScope.VIDEOS_READ,
  ApiKeyScope.VIDEOS_CREATE,
  ApiKeyScope.VIDEOS_UPDATE,
  ApiKeyScope.IMAGES_READ,
  ApiKeyScope.IMAGES_CREATE,
  ApiKeyScope.IMAGES_UPDATE,
  ApiKeyScope.PROMPTS_READ,
  ApiKeyScope.PROMPTS_CREATE,
  ApiKeyScope.ARTICLES_READ,
  ApiKeyScope.ARTICLES_CREATE,
  ApiKeyScope.BRANDS_READ,
  ApiKeyScope.CREDITS_READ,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.ANALYTICS_READ,
];

const DESKTOP_ADMIN_SCOPES: string[] = [
  ...DESKTOP_STANDARD_SCOPES,
  ApiKeyScope.ADMIN,
  ApiKeyScope.CREDITS_PROVISION,
];

type DesktopAuthRecord = {
  codeChallenge: string;
  expiresAt: Date;
  id: string;
  organizationId: string;
  scopes: string[];
  stateHash: string;
  userEmail?: string;
  userId: string;
  userName?: string;
};

@Injectable()
export class AuthDesktopService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  async createCode(
    user: User,
    request: Request,
    dto: CreateDesktopAuthCodeDto,
  ): Promise<{ code: string; expiresAt: string; state: string }> {
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user;
    const organizationId = publicMetadata.organization;

    if (!userId || !organizationId) {
      throw new UnauthorizedException('User identity is incomplete');
    }

    const scopes = getIsSuperAdmin(user, request)
      ? DESKTOP_ADMIN_SCOPES
      : DESKTOP_STANDARD_SCOPES;

    const now = Date.now();
    const expiresAt = now + DESKTOP_AUTH_CODE_TTL_MS;
    const code = toBase64Url(randomBytes(32));
    const email = user.emailAddresses?.[0]?.emailAddress;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

    // sql-risk-audit: ignore bulk-write-tenant-review -- Global TTL cleanup uses expiresAt/usedAt predicates on short-lived auth codes, not tenant content.
    await this.prisma.desktopAuthCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }],
      },
    });

    await this.prisma.desktopAuthCode.create({
      data: {
        codeChallenge: dto.codeChallenge,
        codeHash: hashToken(code),
        expiresAt: new Date(expiresAt),
        organizationId,
        scopes,
        stateHash: hashToken(dto.state),
        userEmail: email || undefined,
        userId,
        userName: name || undefined,
      },
    });

    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      state: dto.state,
    };
  }

  private toDesktopAuthRecord(record: {
    codeChallenge: string;
    expiresAt: Date;
    id: string;
    organizationId: string;
    scopes: string[];
    stateHash: string;
    userEmail: string | null;
    userId: string;
    userName: string | null;
  }): DesktopAuthRecord {
    return {
      codeChallenge: record.codeChallenge,
      expiresAt: record.expiresAt,
      id: record.id,
      organizationId: record.organizationId,
      scopes: record.scopes,
      stateHash: record.stateHash,
      userEmail: record.userEmail ?? undefined,
      userId: record.userId,
      userName: record.userName ?? undefined,
    };
  }

  async exchangeCode(dto: ExchangeDesktopAuthCodeDto): Promise<{
    issuedAt: string;
    token: string;
    userEmail?: string;
    userId: string;
    userName?: string;
  }> {
    const persisted = await this.prisma.desktopAuthCode.findUnique({
      where: { codeHash: hashToken(dto.code) },
    });

    if (!persisted || persisted.usedAt) {
      throw new BadRequestException('Invalid desktop authorization code');
    }

    const record = this.toDesktopAuthRecord(persisted);

    if (record.expiresAt <= new Date()) {
      throw new BadRequestException('Expired desktop authorization code');
    }

    if (!safeEqual(record.stateHash, hashToken(dto.state))) {
      throw new BadRequestException('Invalid desktop authorization state');
    }

    const verifierChallenge = buildCodeChallenge(dto.codeVerifier);
    if (!safeEqual(record.codeChallenge, verifierChallenge)) {
      throw new BadRequestException('Invalid desktop authorization verifier');
    }

    const consumeResult = await this.prisma.desktopAuthCode.updateMany({
      data: { usedAt: new Date() },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        usedAt: null,
        userId: record.userId,
      },
    });

    if (consumeResult.count !== 1) {
      throw new BadRequestException('Invalid desktop authorization code');
    }

    const { plainKey } = await this.apiKeysService.createWithKey(
      {
        category: ApiKeyCategory.GENFEEDAI,
        description: 'Auto-generated key for Genfeed Desktop',
        expiresAt: new Date(Date.now() + DESKTOP_SESSION_TTL_MS).toISOString(),
        label: 'Desktop',
        metadata: {
          kind: 'desktop-session',
        },
        organizationId: record.organizationId,
        rateLimit: 120,
        scopes: record.scopes,
        userId: record.userId,
      },
      ActionOrigin.UI,
    );

    return {
      issuedAt: new Date().toISOString(),
      token: plainKey,
      userEmail: record.userEmail,
      userId: record.userId,
      userName: record.userName,
    };
  }
}
