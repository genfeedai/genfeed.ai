import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import type { PublicArticleScope } from '@api/collections/articles/utils/public-article-scope.util';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ChannelDispatchInput } from '@api/services/activity-recording/activity-recording.types';
import { readNonEmptyString } from '@genfeedai/utils/data/extract.util';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * The operator Discord card for a just-published article, as an outbox
 * channel delivery (#5197). One card per article, however often it is saved.
 */
export function buildArticlePublishedDispatch(
  article: ArticleDocument,
  organizationId: string,
  publicBaseUrl: string | undefined,
): ChannelDispatchInput {
  // Only Genfeed's own articles are hosted on the website; callers pass no
  // base URL for any other organization.
  const publicUrl =
    article.slug && publicBaseUrl
      ? `${publicBaseUrl.replace(/\/$/, '')}/articles/${article.slug}`
      : undefined;
  return {
    deduplicationKey: `message.article-published/${article.id}`,
    messages: [
      {
        destination: null,
        message: {
          action: 'article_notification',
          payload: {
            category: readNonEmptyString(article.category),
            // `articles.label` is NOT NULL, so the row always carries it.
            label: String(article.label),
            publicUrl,
            slug: readNonEmptyString(article.slug) ?? article.id,
            summary: readNonEmptyString(article.summary),
          },
          type: 'discord',
        },
      },
    ],
    organizationId,
    source: { id: article.id, type: 'article' },
    topic: 'operator.alerts',
  };
}

/**
 * Send a Discord notification when an article was just published.
 * No-op unless the update normalized to PUBLISHED, the supporting services are
 * wired, and the organization has Discord notifications enabled. Never throws:
 * a failed notification must not fail the update.
 *
 * Takes the already-normalized publish signal rather than the raw DTO status so
 * legacy `public` input notifies exactly like canonical `PUBLISHED` input.
 */
export async function sendArticlePublishedNotification(
  deps: {
    activityRecorder?: ActivityRecorderService;
    configService?: ConfigService;
    logger: LoggerService;
    organizationSettingsService?: OrganizationSettingsService;
    /** Only the organization the website hosts gets a genfeed.ai link. */
    publicArticleScope: PublicArticleScope;
    source: string;
  },
  result: ArticleDocument,
  organizationId: string,
  isPublishingUpdate: boolean,
): Promise<void> {
  const {
    activityRecorder,
    configService,
    logger,
    organizationSettingsService,
    publicArticleScope,
    source,
  } = deps;
  if (
    !isPublishingUpdate ||
    !activityRecorder ||
    !organizationSettingsService ||
    !configService
  ) {
    return;
  }

  try {
    const organizationSettings = await organizationSettingsService.findOne({
      organizationId,
    });

    if (!organizationSettings?.isNotificationsDiscordEnabled) {
      return;
    }

    await activityRecorder.dispatch(
      buildArticlePublishedDispatch(
        result,
        organizationId,
        (await publicArticleScope.isHostedOrganization(organizationId))
          ? configService.get('GENFEEDAI_PUBLIC_URL')
          : undefined,
      ),
    );

    logger.log(
      `${source} recorded Discord notification for published article`,
      {
        articleId: result.id,
        slug: result.slug,
      },
    );
  } catch (error: unknown) {
    // Don't fail the update if notification fails
    logger.error(`${source} failed to send Discord notification`, {
      articleId: result.id,
      error,
    });
  }
}
