import type { ScheduledPostWorkflowSource } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import {
  TIKTOK_DELIVERY_MODE_APP,
  TIKTOK_DELIVERY_MODE_SETTING_KEY,
} from '@genfeedai/contracts/api-types/contracts/tiktok-publishing.contract';
import type { Prisma } from '@genfeedai/prisma';

/**
 * The target settings a publish action leaves on a TikTok target. The creator
 * chooses the delivery with the action: "Publish via TikTok app" records it,
 * and any other publish or schedule action clears it, so a retry or a scheduled
 * sweep sends the post the way the creator last approved and never switches
 * from the Inbox to a public post on its own.
 */
export function tikTokDeliverySettings(
  settings: Record<string, unknown>,
  workflowSource: ScheduledPostWorkflowSource,
): Prisma.InputJsonObject {
  const { [TIKTOK_DELIVERY_MODE_SETTING_KEY]: _previous, ...rest } = settings;
  return (
    workflowSource === 'tiktok_app'
      ? {
          ...rest,
          [TIKTOK_DELIVERY_MODE_SETTING_KEY]: TIKTOK_DELIVERY_MODE_APP,
        }
      : rest
  ) as Prisma.InputJsonObject;
}
