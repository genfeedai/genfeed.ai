import type { ISerializerRelationship } from '@genfeedai/helpers';
import { evaluationSerializerConfig } from '@serializers/configs/analytics/evaluation.config';
import { watchlistSerializerConfig } from '@serializers/configs/analytics/watchlist.config';
import { botSerializerConfig } from '@serializers/configs/automation/bot.config';
import { botActivitySerializerConfig } from '@serializers/configs/automation/bot-activity.config';
import { monitoredAccountSerializerConfig } from '@serializers/configs/automation/monitored-account.config';
import { replyBotConfigSerializerConfig } from '@serializers/configs/automation/reply-bot-config.config';
import { workflowSerializerConfig } from '@serializers/configs/automation/workflow.config';
import {
  subscriptionPreviewSerializerConfig,
  subscriptionSerializerConfig,
} from '@serializers/configs/billing/subscription.config';
import { modelSerializerConfig } from '@serializers/configs/collections/model.config';
import { promptSerializerConfig } from '@serializers/configs/collections/prompt.config';
import { roleSerializerConfig } from '@serializers/configs/collections/role.config';
import { trainingSerializerConfig } from '@serializers/configs/collections/training.config';
import { trendSerializerConfig } from '@serializers/configs/collections/trend.config';
import { voteSerializerConfig } from '@serializers/configs/collections/vote.config';
import {
  activityBulkPatchSerializerConfig,
  activitySerializerConfig,
} from '@serializers/configs/common/activity.config';
import {
  analyticsBrandLeaderboardSerializerConfig,
  analyticsBrandStatsSerializerConfig,
  analyticsEngagementSerializerConfig,
  analyticsGrowthSerializerConfig,
  analyticsHooksSerializerConfig,
  analyticsOrgLeaderboardSerializerConfig,
  analyticsOrgStatsSerializerConfig,
  analyticsOverviewSerializerConfig,
  analyticsPlatformSerializerConfig,
  analyticsSerializerConfig,
  analyticsTimeSeriesWithPlatformsSerializerConfig,
  analyticsTopContentSerializerConfig,
  analyticsTrendSerializerConfig,
} from '@serializers/configs/common/analytics.config';
import {
  apiKeyFullSerializerConfig,
  apiKeySerializerConfig,
} from '@serializers/configs/common/api-key.config';
import { articleSerializerConfig } from '@serializers/configs/content/article.config';
import { bookmarkSerializerConfig } from '@serializers/configs/content/bookmark.config';
import {
  ingredientBulkDeleteSerializerConfig,
  ingredientMergeSerializerConfig,
  ingredientSerializerConfig,
  ingredientUploadSerializerConfig,
} from '@serializers/configs/content/ingredient.config';
import { linkSerializerConfig } from '@serializers/configs/content/link.config';
import { newsSerializerConfig } from '@serializers/configs/content/news.config';
import { personaSerializerConfig } from '@serializers/configs/content/persona.config';
import { postSerializerConfig } from '@serializers/configs/content/post.config';
import { presignedUploadSerializerConfig } from '@serializers/configs/content/presigned-upload.config';
import { templateSerializerConfig } from '@serializers/configs/content/template.config';
import {
  videoCaptionSerializerConfig,
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '@serializers/configs/content/video.config';
import { elementBlacklistSerializerConfig } from '@serializers/configs/elements/blacklist.config';
import { elementCameraSerializerConfig } from '@serializers/configs/elements/camera.config';
import { elementCameraMovementSerializerConfig } from '@serializers/configs/elements/camera-movement.config';
import { captionSerializerConfig } from '@serializers/configs/elements/caption.config';
import { fontFamilySerializerConfig } from '@serializers/configs/elements/font-family.config';
import { elementLensSerializerConfig } from '@serializers/configs/elements/lens.config';
import { elementLightingSerializerConfig } from '@serializers/configs/elements/lighting.config';
import { elementMoodSerializerConfig } from '@serializers/configs/elements/mood.config';
import { presetSerializerConfig } from '@serializers/configs/elements/preset.config';
import { elementSceneSerializerConfig } from '@serializers/configs/elements/scene.config';
import { soundSerializerConfig } from '@serializers/configs/elements/sound.config';
import { elementStyleSerializerConfig } from '@serializers/configs/elements/style.config';
import { voiceSerializerConfig } from '@serializers/configs/elements/voice.config';
import { assetSerializerConfig } from '@serializers/configs/ingredients/asset.config';
import { avatarSerializerConfig } from '@serializers/configs/ingredients/avatar.config';
import { imageSerializerConfig } from '@serializers/configs/ingredients/image.config';
import { metadataSerializerConfig } from '@serializers/configs/ingredients/metadata.config';
import { musicSerializerConfig } from '@serializers/configs/ingredients/music.config';
import { serviceSerializerConfig } from '@serializers/configs/integrations/service-server.config';
import {
  stripeCheckoutSerializerConfig,
  stripeUrlSerializerConfig,
} from '@serializers/configs/integrations/stripe.config';
import { folderSerializerConfig } from '@serializers/configs/management/folder.config';
import { tagSerializerConfig } from '@serializers/configs/management/tag.config';
import { brandSerializerConfig } from '@serializers/configs/organizations/brand.config';
import { organizationSerializerConfig } from '@serializers/configs/organizations/organization.config';
import { organizationSettingsSerializerConfig } from '@serializers/configs/organizations/organization-settings.config';
import { threadMessageSerializerConfig } from '@serializers/configs/threads/thread-message.config';
import { settingSerializerConfig } from '@serializers/configs/users/setting.config';
import { userSerializerConfig } from '@serializers/configs/users/user.config';
import { describe, expect, it } from 'vitest';

interface SerializerConfigFixture {
  attributes: readonly string[];
  type: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRelationship(value: unknown): value is ISerializerRelationship {
  return isRecord(value) && typeof value.type === 'string';
}

function asSerializerConfig(
  config: SerializerConfigFixture,
): Record<string, unknown> {
  return config;
}

const SERIALIZER_CONFIGS: Array<{
  config: SerializerConfigFixture;
  name: string;
}> = [
  {
    config: replyBotConfigSerializerConfig,
    name: 'replyBotConfigSerializerConfig',
  },
  { config: botSerializerConfig, name: 'botSerializerConfig' },
  { config: workflowSerializerConfig, name: 'workflowSerializerConfig' },
  {
    config: monitoredAccountSerializerConfig,
    name: 'monitoredAccountSerializerConfig',
  },
  { config: botActivitySerializerConfig, name: 'botActivitySerializerConfig' },
  { config: evaluationSerializerConfig, name: 'evaluationSerializerConfig' },
  { config: watchlistSerializerConfig, name: 'watchlistSerializerConfig' },
  {
    config: stripeCheckoutSerializerConfig,
    name: 'stripeCheckoutSerializerConfig',
  },
  { config: stripeUrlSerializerConfig, name: 'stripeUrlSerializerConfig' },
  { config: serviceSerializerConfig, name: 'serviceSerializerConfig' },
  { config: activitySerializerConfig, name: 'activitySerializerConfig' },
  {
    config: activityBulkPatchSerializerConfig,
    name: 'activityBulkPatchSerializerConfig',
  },
  { config: apiKeySerializerConfig, name: 'apiKeySerializerConfig' },
  { config: apiKeyFullSerializerConfig, name: 'apiKeyFullSerializerConfig' },
  { config: analyticsSerializerConfig, name: 'analyticsSerializerConfig' },
  {
    config: analyticsTimeSeriesWithPlatformsSerializerConfig,
    name: 'analyticsTimeSeriesWithPlatformsSerializerConfig',
  },
  {
    config: analyticsPlatformSerializerConfig,
    name: 'analyticsPlatformSerializerConfig',
  },
  {
    config: analyticsTopContentSerializerConfig,
    name: 'analyticsTopContentSerializerConfig',
  },
  {
    config: analyticsOrgLeaderboardSerializerConfig,
    name: 'analyticsOrgLeaderboardSerializerConfig',
  },
  {
    config: analyticsBrandLeaderboardSerializerConfig,
    name: 'analyticsBrandLeaderboardSerializerConfig',
  },
  {
    config: analyticsOrgStatsSerializerConfig,
    name: 'analyticsOrgStatsSerializerConfig',
  },
  {
    config: analyticsBrandStatsSerializerConfig,
    name: 'analyticsBrandStatsSerializerConfig',
  },
  {
    config: analyticsOverviewSerializerConfig,
    name: 'analyticsOverviewSerializerConfig',
  },
  {
    config: analyticsGrowthSerializerConfig,
    name: 'analyticsGrowthSerializerConfig',
  },
  {
    config: analyticsEngagementSerializerConfig,
    name: 'analyticsEngagementSerializerConfig',
  },
  {
    config: analyticsHooksSerializerConfig,
    name: 'analyticsHooksSerializerConfig',
  },
  {
    config: analyticsTrendSerializerConfig,
    name: 'analyticsTrendSerializerConfig',
  },
  { config: brandSerializerConfig, name: 'brandSerializerConfig' },
  {
    config: organizationSettingsSerializerConfig,
    name: 'organizationSettingsSerializerConfig',
  },
  {
    config: organizationSerializerConfig,
    name: 'organizationSerializerConfig',
  },
  { config: roleSerializerConfig, name: 'roleSerializerConfig' },
  { config: modelSerializerConfig, name: 'modelSerializerConfig' },
  { config: promptSerializerConfig, name: 'promptSerializerConfig' },
  { config: trainingSerializerConfig, name: 'trainingSerializerConfig' },
  { config: trendSerializerConfig, name: 'trendSerializerConfig' },
  { config: voteSerializerConfig, name: 'voteSerializerConfig' },
  { config: folderSerializerConfig, name: 'folderSerializerConfig' },
  { config: tagSerializerConfig, name: 'tagSerializerConfig' },
  { config: settingSerializerConfig, name: 'settingSerializerConfig' },
  { config: userSerializerConfig, name: 'userSerializerConfig' },
  { config: metadataSerializerConfig, name: 'metadataSerializerConfig' },
  { config: assetSerializerConfig, name: 'assetSerializerConfig' },
  { config: musicSerializerConfig, name: 'musicSerializerConfig' },
  { config: imageSerializerConfig, name: 'imageSerializerConfig' },
  { config: avatarSerializerConfig, name: 'avatarSerializerConfig' },
  {
    config: presignedUploadSerializerConfig,
    name: 'presignedUploadSerializerConfig',
  },
  { config: templateSerializerConfig, name: 'templateSerializerConfig' },
  { config: articleSerializerConfig, name: 'articleSerializerConfig' },
  { config: ingredientSerializerConfig, name: 'ingredientSerializerConfig' },
  {
    config: ingredientBulkDeleteSerializerConfig,
    name: 'ingredientBulkDeleteSerializerConfig',
  },
  {
    config: ingredientUploadSerializerConfig,
    name: 'ingredientUploadSerializerConfig',
  },
  {
    config: ingredientMergeSerializerConfig,
    name: 'ingredientMergeSerializerConfig',
  },
  { config: videoSerializerConfig, name: 'videoSerializerConfig' },
  { config: videoEditSerializerConfig, name: 'videoEditSerializerConfig' },
  {
    config: videoCaptionSerializerConfig,
    name: 'videoCaptionSerializerConfig',
  },
  { config: personaSerializerConfig, name: 'personaSerializerConfig' },
  { config: newsSerializerConfig, name: 'newsSerializerConfig' },
  { config: postSerializerConfig, name: 'postSerializerConfig' },
  { config: bookmarkSerializerConfig, name: 'bookmarkSerializerConfig' },
  { config: linkSerializerConfig, name: 'linkSerializerConfig' },
  {
    config: threadMessageSerializerConfig,
    name: 'threadMessageSerializerConfig',
  },
  {
    config: subscriptionSerializerConfig,
    name: 'subscriptionSerializerConfig',
  },
  {
    config: subscriptionPreviewSerializerConfig,
    name: 'subscriptionPreviewSerializerConfig',
  },
  {
    config: elementStyleSerializerConfig,
    name: 'elementStyleSerializerConfig',
  },
  { config: soundSerializerConfig, name: 'soundSerializerConfig' },
  { config: presetSerializerConfig, name: 'presetSerializerConfig' },
  {
    config: elementSceneSerializerConfig,
    name: 'elementSceneSerializerConfig',
  },
  { config: captionSerializerConfig, name: 'captionSerializerConfig' },
  { config: elementLensSerializerConfig, name: 'elementLensSerializerConfig' },
  {
    config: elementLightingSerializerConfig,
    name: 'elementLightingSerializerConfig',
  },
  {
    config: elementBlacklistSerializerConfig,
    name: 'elementBlacklistSerializerConfig',
  },
  {
    config: elementCameraSerializerConfig,
    name: 'elementCameraSerializerConfig',
  },
  {
    config: elementCameraMovementSerializerConfig,
    name: 'elementCameraMovementSerializerConfig',
  },
  { config: fontFamilySerializerConfig, name: 'fontFamilySerializerConfig' },
  { config: elementMoodSerializerConfig, name: 'elementMoodSerializerConfig' },
  { config: voiceSerializerConfig, name: 'voiceSerializerConfig' },
];

describe('Serializer Configs', () => {
  describe.each(SERIALIZER_CONFIGS)('$name', ({ config }) => {
    it('should have type and attributes', () => {
      expect(typeof config.type).toBe('string');
      expect(config.type.length).toBeGreaterThan(0);
      expect(Array.isArray(config.attributes)).toBe(true);
      expect(config.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(asSerializerConfig(config))) {
        if (key === 'type' || key === 'attributes') continue;
        if (!isRelationship(val)) continue;
        expect(typeof val.type).toBe('string');
        if ('ref' in val) expect(val.ref).toBe('id');
        if ('attributes' in val)
          expect(Array.isArray(val.attributes)).toBe(true);
      }
    });
  });
});
