import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { filterSourcePostVariations } from '@api/collections/posts/services/source-post-variation-output.util';
import {
  ContentIntelligencePlatform,
  type Platform,
  parsePlatform,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

/** One post to create: which account publishes it, carrying which body. */
export interface PostAccountTarget {
  caption: string;
  credentialId: string;
  platform: Platform;
}

export interface ResolvePostAccountTargetsInput {
  brandId: string;
  caption: string;
  organizationId: string;
  platforms: readonly string[];
}

/**
 * Platforms the content engine can write distinct variations for. Domain
 * platform ids and `ContentIntelligencePlatform` values share a spelling, so
 * the map is keyed by the domain id directly.
 */
const VARIATION_CAPABLE_PLATFORMS = new Map<
  string,
  ContentIntelligencePlatform
>(
  Object.values(ContentIntelligencePlatform).map((platform) => [
    String(platform),
    platform,
  ]),
);

/**
 * Expands an automated publish request across every connected account a brand
 * holds on each requested platform.
 *
 * A brand may hold several accounts on one platform, so "publish to TikTok" is
 * a fan-out, not a lookup. Sibling accounts posting an identical body are
 * suppressed as duplicates by the platforms themselves, so a fan-out wider than
 * one account per platform asks the content engine for distinct variations and
 * hands each account its own.
 */
@Injectable()
export class PostAccountFanoutService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolveTargets(
    input: ResolvePostAccountTargetsInput,
  ): Promise<PostAccountTarget[]> {
    const targets: PostAccountTarget[] = [];

    const platforms = [
      ...new Set(
        input.platforms
          .map(parsePlatform)
          .filter((platform): platform is Platform => Boolean(platform)),
      ),
    ];

    for (const platform of platforms) {
      const accounts = await this.credentialsService.findConnectedAccounts(
        input.organizationId,
        input.brandId,
        platform,
      );

      if (accounts.length === 0) {
        continue;
      }

      const captions = await this.resolveCaptions(
        input,
        platform,
        accounts.length,
        platforms.length > 1,
      );

      accounts.forEach((account, index) => {
        targets.push({
          caption: captions[index],
          credentialId: account.id.toString(),
          platform,
        });
      });
    }

    return targets;
  }

  private async resolveCaptions(
    input: ResolvePostAccountTargetsInput,
    platform: Platform,
    accountCount: number,
    adaptPlatform: boolean,
  ): Promise<string[]> {
    const original = filterSourcePostVariations([input.caption], '', platform)
      .accepted[0];
    if (!adaptPlatform && !original) {
      throw new BadRequestException(
        `Source caption is empty or exceeds the ${platform} platform limit.`,
      );
    }
    const captions = !adaptPlatform && original ? [original] : [];
    if (captions.length === accountCount) return captions;

    const generatorPlatform = VARIATION_CAPABLE_PLATFORMS.get(platform);
    if (!generatorPlatform) {
      throw new BadRequestException(
        `Distinct account variations are unavailable for ${platform}.`,
      );
    }

    try {
      while (captions.length < accountCount) {
        const needed = Math.min(accountCount - captions.length, 10);
        const generated = await this.contentGeneratorService.generateContent(
          input.organizationId,
          {
            additionalContext: [
              `Adapt the source for ${platform}. Each account needs a distinct hook, phrasing, and structure.`,
              'Preserve supported facts and the intended message. Do not invent claims or copy the source verbatim.',
              ...captions.map(
                (caption) => `Already assigned; do not repeat: ${caption}`,
              ),
            ],
            brandId: input.brandId,
            platform: generatorPlatform,
            topic: input.caption,
            variationsCount: needed,
          },
        );
        const existingVariations = captions.filter(
          (caption) => caption !== original,
        );
        const filtered = filterSourcePostVariations(
          [...existingVariations, ...generated.map((item) => item.content)],
          input.caption,
          platform,
        );
        const fresh = filtered.accepted.slice(
          existingVariations.length,
          existingVariations.length + needed,
        );
        if (fresh.length !== needed) {
          throw new BadGatewayException(
            `The content engine returned insufficient distinct, platform-valid variations for ${platform}. No account targets were queued.`,
          );
        }
        captions.push(...fresh);
      }
      return captions;
    } catch (error: unknown) {
      this.loggerService.error(
        `${PostAccountFanoutService.name} variation generation failed`,
        error,
      );
      throw error;
    }
  }
}
