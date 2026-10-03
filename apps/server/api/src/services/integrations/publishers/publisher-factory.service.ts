import type { IPublisher, ServerPublisherFactory } from '@api/index';
import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type {
  PublishContext,
  PublisherPostInput,
  ServerPublisherIngredientInput,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
import { RedditPublisherService } from '@api/services/integrations/publishers/reddit-publisher.service';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { SnapchatPublisherService } from '@api/services/integrations/publishers/snapchat-publisher.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { TikTokPublisherService } from '@api/services/integrations/publishers/tiktok-publisher.service';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { WhatsappPublisherService } from '@api/services/integrations/publishers/whatsapp-publisher.service';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { YouTubePublisherService } from '@api/services/integrations/publishers/youtube-publisher.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, type OnModuleInit, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/**
 * Factory service to get the appropriate publisher for a platform
 */
@Injectable()
export class PublisherFactoryService
  implements ServerPublisherFactory, OnModuleInit
{
  private readonly publishers = new Map<CredentialPlatform, IPublisher>();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly authorizedMediaUrlService: AuthorizedMediaUrlService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const providers: ReadonlyArray<
      readonly [CredentialPlatform, Type<IPublisher>]
    > = [
      [CredentialPlatform.TWITTER, TwitterPublisherService],
      [CredentialPlatform.INSTAGRAM, InstagramPublisherService],
      [CredentialPlatform.TIKTOK, TikTokPublisherService],
      [CredentialPlatform.YOUTUBE, YouTubePublisherService],
      [CredentialPlatform.FACEBOOK, FacebookPublisherService],
      [CredentialPlatform.LINKEDIN, LinkedInPublisherService],
      [CredentialPlatform.PINTEREST, PinterestPublisherService],
      [CredentialPlatform.REDDIT, RedditPublisherService],
      [CredentialPlatform.THREADS, ThreadsPublisherService],
      [CredentialPlatform.FANVUE, FanvuePublisherService],
      [CredentialPlatform.WORDPRESS, WordpressPublisherService],
      [CredentialPlatform.SNAPCHAT, SnapchatPublisherService],
      [CredentialPlatform.WHATSAPP, WhatsappPublisherService],
      [CredentialPlatform.MASTODON, MastodonPublisherService],
      [CredentialPlatform.GHOST, GhostPublisherService],
      [CredentialPlatform.SHOPIFY, ShopifyPublisherService],
      [CredentialPlatform.BEEHIIV, BeehiivPublisherService],
    ];
    // All publishers are required providers of this module. Strict lookup
    // keeps a missing registration a boot error instead of a publish failure.
    for (const [platform, provider] of providers) {
      const publisher = this.moduleRef.get<IPublisher>(provider);
      this.publishers.set(
        platform,
        this.configService.isAuthorizedMediaDeliveryEnabled
          ? this.authorizePublisher(publisher)
          : publisher,
      );
    }
  }

  private authorizePublisher(publisher: IPublisher): IPublisher {
    return {
      platform: publisher.platform,
      supportsCarousel: publisher.supportsCarousel,
      supportsImages: publisher.supportsImages,
      supportsTextOnly: publisher.supportsTextOnly,
      supportsThreads: publisher.supportsThreads,
      supportsVideos: publisher.supportsVideos,
      buildPostUrl: publisher.buildPostUrl.bind(publisher),
      validatePost: publisher.validatePost.bind(publisher),
      ...(publisher.verifyPublished
        ? { verifyPublished: publisher.verifyPublished.bind(publisher) }
        : {}),
      publish: async (context) => {
        const { hydratedContext } = await this.hydrateMedia(context);
        return publisher.publish(hydratedContext);
      },
      ...(publisher.publishThreadChildren
        ? {
            publishThreadChildren: async (
              context: PublishContext,
              children: ThreadChild[],
              parentExternalId: string,
            ) => {
              const { hydratedContext, hydratedChildren } =
                await this.hydrateMedia(context, children);
              return publisher.publishThreadChildren?.(
                hydratedContext,
                hydratedChildren,
                parentExternalId,
              );
            },
          }
        : {}),
    };
  }

  private async hydrateMedia(
    context: PublishContext,
    children: ThreadChild[] = [],
  ): Promise<{
    hydratedContext: PublishContext;
    hydratedChildren: ThreadChild[];
  }> {
    if (
      !context.organizationId ||
      context.organization?.id !== context.organizationId
    ) {
      throw new Error('Publisher execution organization does not match');
    }
    const getId = (
      ingredient: ServerPublisherIngredientInput | string,
    ): string => {
      const id =
        typeof ingredient === 'string' ? ingredient : ingredient.id?.toString();
      if (!id?.trim()) {
        throw new Error('Publisher ingredient has no canonical ID');
      }
      return id;
    };
    const allIngredients = [
      ...(context.post.ingredients || []),
      ...children.flatMap((child) => child.ingredients || []),
    ];
    const ids = [...new Set(allIngredients.map(getId))];
    const urls = ids.length
      ? await this.authorizedMediaUrlService.issueServerPublish(
          context.organizationId,
          ids,
        )
      : new Map<string, string>();
    const hydrateIngredients = (
      ingredients: PublisherPostInput['ingredients'],
    ): ServerPublisherIngredientInput[] =>
      ingredients.map((ingredient) => {
        const id = getId(ingredient);
        const mediaUrl = urls.get(id);
        if (!mediaUrl) {
          throw new Error(
            'Publisher ingredient has no authorized execution URL',
          );
        }
        return {
          ...(typeof ingredient === 'object' && ingredient.category
            ? { category: ingredient.category }
            : {}),
          id,
          mediaUrl,
        };
      });
    return {
      hydratedContext: {
        ...context,
        post: {
          ...context.post,
          ingredients: hydrateIngredients(context.post.ingredients || []),
        },
      },
      hydratedChildren: children.map((child) => ({
        ...child,
        ingredients: hydrateIngredients(child.ingredients || []),
      })),
    };
  }

  /**
   * Get the publisher for a specific platform
   * @param platform The platform to get the publisher for
   * @returns The publisher for the platform, or null if not supported
   */
  getPublisher(platform: string): IPublisher | null {
    const domainPlatform = fromPrismaCredentialPlatform(platform);
    if (!domainPlatform) {
      return null;
    }
    return this.publishers.get(domainPlatform) || null;
  }

  /**
   * Check if a platform is supported
   * @param platform The platform to check
   * @returns True if the platform is supported
   */
  isSupported(platform: string): boolean {
    const domainPlatform = fromPrismaCredentialPlatform(platform);
    if (!domainPlatform) {
      return false;
    }
    return this.publishers.has(domainPlatform);
  }

  /**
   * Get all supported platforms
   * @returns Array of supported platforms
   */
  getSupportedPlatforms(): CredentialPlatform[] {
    return Array.from(this.publishers.keys());
  }
}
