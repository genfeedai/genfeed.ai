import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  AccountPublishingConstraints,
  AccountPublishingContext,
  AccountPublishingRecentPost,
  AccountPublishingSourceLineage,
  ContentSurface,
  Publishability,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ResolveAccountPublishingContextParams {
  brandId: string;
  credentialId: string;
  organizationId: string;
  sourceLineage?: AccountPublishingSourceLineage;
  surface: ContentSurface;
}

const DEFAULT_CHARACTER_LIMIT = 5000;
const PLATFORM_CHARACTER_LIMITS: Partial<Record<CredentialPlatform, number>> = {
  [CredentialPlatform.INSTAGRAM]: 2200,
  [CredentialPlatform.LINKEDIN]: 3000,
  [CredentialPlatform.MASTODON]: 500,
  [CredentialPlatform.THREADS]: 500,
  [CredentialPlatform.TIKTOK]: 2200,
  [CredentialPlatform.TWITTER]: 280,
  [CredentialPlatform.YOUTUBE]: 5000,
};

function normalizeCredentialPlatform(value: unknown): CredentialPlatform {
  const normalized = String(value ?? '').toLowerCase();
  const platform = Object.values(CredentialPlatform).find(
    (candidate) => candidate === normalized,
  );

  return platform ?? CredentialPlatform.TWITTER;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

@Injectable()
export class AccountPublishingContextService {
  constructor(
    private readonly accountHealthService: AccountHealthService,
    private readonly credentialsService: CredentialsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    params: ResolveAccountPublishingContextParams,
  ): Promise<AccountPublishingContext> {
    const credential = await this.credentialsService.findOne({
      _id: params.credentialId,
      brand: params.brandId,
      isConnected: true,
      isDeleted: false,
      organization: params.organizationId,
    });

    if (!credential) {
      throw new NotFoundException({
        message: 'The specified account does not exist or is not connected',
      });
    }

    const platform = normalizeCredentialPlatform(credential.platform);
    const [brand, recentPosts] = await Promise.all([
      this.prisma.brand.findFirst({
        select: {
          agentConfig: true,
          description: true,
          id: true,
          label: true,
          slug: true,
          text: true,
        },
        where: {
          id: params.brandId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
      }),
      this.prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          description: true,
          id: true,
          label: true,
          platform: true,
          status: true,
        },
        take: 5,
        where: {
          brandId: params.brandId,
          credentialId: params.credentialId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
      }),
    ]);

    const context: AccountPublishingContext = {
      account: {
        externalUrl: readString(credential.externalUrl),
        handle: this.getCredentialHandle(credential),
        id: String(credential._id ?? credential.id),
        label: this.getCredentialLabel(credential, platform),
        platform,
      },
      accountHealth: await this.accountHealthService.assessCredentialHealth({
        brandId: params.brandId,
        credentialId: params.credentialId,
        organizationId: params.organizationId,
      }),
      brand: {
        agentConfig: readRecord(brand?.agentConfig),
        description: readString(brand?.description),
        id: String(brand?.id ?? params.brandId),
        label: readString(brand?.label),
        slug: readString(brand?.slug),
        voice: readString(brand?.text),
      },
      constraints: this.getConstraints(platform, params.surface),
      promptHints: [],
      publishability: this.getPublishability(platform, params.surface),
      recentPosts: recentPosts.map(
        (post): AccountPublishingRecentPost => ({
          createdAt: post.createdAt?.toISOString(),
          description: post.description ?? '',
          id: post.id,
          label: post.label ?? undefined,
          platform: normalizeCredentialPlatform(post.platform),
          status: String(post.status ?? '').toLowerCase() || undefined,
        }),
      ),
      sourceLineage: params.sourceLineage,
      surface: params.surface,
    };

    context.promptHints = this.buildPromptHints(context);

    this.logger.debug('Resolved account publishing context', {
      credentialId: params.credentialId,
      platform,
      surface: params.surface,
    });

    return context;
  }

  private getCredentialHandle(
    credential: CredentialDocument,
  ): string | undefined {
    return readString(credential.externalHandle ?? credential.handle);
  }

  private getCredentialLabel(
    credential: CredentialDocument,
    platform: CredentialPlatform,
  ): string {
    const explicitLabel =
      readString(credential.label) ?? readString(credential.externalName);
    const handle = this.getCredentialHandle(credential);

    if (explicitLabel) {
      return explicitLabel;
    }

    return handle ? `${platform} @${handle.replace(/^@/, '')}` : platform;
  }

  private getConstraints(
    platform: CredentialPlatform,
    surface: ContentSurface,
  ): AccountPublishingConstraints {
    if (platform === CredentialPlatform.TWITTER) {
      if (surface === 'x-article') {
        return {
          maxCharacters: 25_000,
          notes: [
            'X Articles are copy/export only in Genfeed.',
            'Do not create a schedulable post record for this format.',
          ],
          supportsDirectPublishing: false,
          supportsRichArticleCopy: true,
          supportsThreads: true,
          usesWeightedCharacters: false,
        };
      }

      return {
        maxWeightedCharacters: 280,
        notes: ['Standard X posts use the 280 weighted-character limit.'],
        supportsDirectPublishing: true,
        supportsRichArticleCopy: false,
        supportsThreads: true,
        usesWeightedCharacters: true,
      };
    }

    return {
      maxCharacters:
        PLATFORM_CHARACTER_LIMITS[platform] ?? DEFAULT_CHARACTER_LIMIT,
      notes: ['Use the selected account and brand voice for platform fit.'],
      supportsDirectPublishing: true,
      supportsRichArticleCopy: false,
      supportsThreads: platform === CredentialPlatform.THREADS,
      usesWeightedCharacters: false,
    };
  }

  private getPublishability(
    platform: CredentialPlatform,
    surface: ContentSurface,
  ): Publishability {
    if (platform === CredentialPlatform.TWITTER && surface === 'x-article') {
      return 'copy_only';
    }

    if (
      surface === 'image' ||
      surface === 'video' ||
      surface === 'newsletter'
    ) {
      return 'copy_only';
    }

    return 'publishable';
  }

  private buildPromptHints(context: AccountPublishingContext): string[] {
    const hints = [
      `Account: ${context.account.label}`,
      `Platform: ${context.account.platform}`,
      `Surface: ${context.surface}`,
      `Publishability: ${context.publishability}`,
    ];

    if (context.account.handle) {
      hints.push(`Handle: @${context.account.handle.replace(/^@/, '')}`);
    }

    if (context.brand.label) {
      hints.push(`Brand: ${context.brand.label}`);
    }

    if (context.brand.description) {
      hints.push(`Brand description: ${context.brand.description}`);
    }

    if (context.brand.voice) {
      hints.push(`Brand voice: ${context.brand.voice}`);
    }

    if (context.accountHealth) {
      hints.push(
        `Account warmup: ${context.accountHealth.state} (${context.accountHealth.riskLevel} risk, score ${context.accountHealth.score})`,
      );

      if (context.accountHealth.holdPublishing) {
        hints.push(
          `Publishing hold: ${context.accountHealth.holdReason ?? 'Warmup guidance required before scheduling.'}`,
        );
      }
    }

    if (context.constraints.maxWeightedCharacters) {
      hints.push(
        `Limit: ${context.constraints.maxWeightedCharacters} weighted characters`,
      );
    } else if (context.constraints.maxCharacters) {
      hints.push(`Limit: ${context.constraints.maxCharacters} characters`);
    }

    for (const recentPost of context.recentPosts.slice(0, 3)) {
      hints.push(`Recent account post: ${recentPost.description}`);
    }

    return hints;
  }
}
