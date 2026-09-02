import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { filterSourcePostVariations } from '@api/collections/posts/services/source-post-variation-output.util';
import {
  ContentIntelligencePlatform,
  type Platform,
  parsePlatform,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

    for (const requested of input.platforms) {
      const platform = parsePlatform(requested);

      if (!platform) {
        continue;
      }

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
      );

      accounts.forEach((account, index) => {
        targets.push({
          caption: captions[index] ?? input.caption,
          credentialId: account.id.toString(),
          platform,
        });
      });
    }

    return targets;
  }

  /**
   * One account keeps the caption as written. Several accounts each get their
   * own body: the first stays the original so the requested message always
   * ships verbatim somewhere, and the rest are distinct variations.
   *
   * Variation is best-effort — a content-engine failure degrades to the shared
   * caption rather than dropping the publish, because a duplicate-suppressed
   * sibling post is a smaller loss than a silent no-post.
   */
  private async resolveCaptions(
    input: ResolvePostAccountTargetsInput,
    platform: Platform,
    accountCount: number,
  ): Promise<string[]> {
    if (accountCount < 2) {
      return [input.caption];
    }

    const generatorPlatform = VARIATION_CAPABLE_PLATFORMS.get(platform);

    if (!generatorPlatform) {
      this.loggerService.warn(
        `${PostAccountFanoutService.name} fan-out has no variation support for ${platform}`,
        { accountCount, brandId: input.brandId },
      );

      return [input.caption];
    }

    const needed = accountCount - 1;

    try {
      const generated = await this.contentGeneratorService.generateContent(
        input.organizationId,
        {
          additionalContext: [
            'Rewrite the source post so sibling accounts on the same platform do not publish duplicate text.',
            'Keep the offer, claim, and call to action identical. Change only phrasing, structure, and hook.',
          ],
          brandId: input.brandId,
          platform: generatorPlatform,
          topic: input.caption,
          variationsCount: Math.min(needed, 10),
        },
      );

      const filtered = filterSourcePostVariations(
        generated.map((item) => item.content),
        input.caption,
        platform,
      );

      if (filtered.accepted.length < needed) {
        this.loggerService.warn(
          `${PostAccountFanoutService.name} produced fewer variations than accounts`,
          {
            accepted: filtered.accepted.length,
            brandId: input.brandId,
            needed,
            platform,
          },
        );
      }

      return [input.caption, ...filtered.accepted];
    } catch (error: unknown) {
      this.loggerService.error(
        `${PostAccountFanoutService.name} variation generation failed`,
        error,
      );

      return [input.caption];
    }
  }
}
