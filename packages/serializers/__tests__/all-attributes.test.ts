import { evaluationAttributes } from '@serializers/attributes/analytics/evaluation.attributes';
import { watchlistAttributes } from '@serializers/attributes/analytics/watchlist.attributes';
import { botAttributes } from '@serializers/attributes/automation/bot.attributes';
import { botActivityAttributes } from '@serializers/attributes/automation/bot-activity.attributes';
import { monitoredAccountAttributes } from '@serializers/attributes/automation/monitored-account.attributes';
import { replyBotConfigAttributes } from '@serializers/attributes/automation/reply-bot-config.attributes';
import { taskAttributes } from '@serializers/attributes/automation/task.attributes';
import { workflowAttributes } from '@serializers/attributes/automation/workflow.attributes';
import {
  subscriptionAttributes,
  subscriptionPreviewAttributes,
} from '@serializers/attributes/billing/subscription.attributes';
import { modelAttributes } from '@serializers/attributes/collections/model.attributes';
import { promptAttributes } from '@serializers/attributes/collections/prompt.attributes';
import { roleAttributes } from '@serializers/attributes/collections/role.attributes';
import { trainingAttributes } from '@serializers/attributes/collections/training.attributes';
import { trendAttributes } from '@serializers/attributes/collections/trend.attributes';
import { voteAttributes } from '@serializers/attributes/collections/vote.attributes';
import {
  activityAttributes,
  activityBulkPatchAttributes,
} from '@serializers/attributes/common/activity.attributes';
import { analyticsAttributes } from '@serializers/attributes/common/analytics.attributes';
import { analyticsBrandLeaderboardAttributes } from '@serializers/attributes/common/analytics-brand-leaderboard.attributes';
import { analyticsEngagementAttributes } from '@serializers/attributes/common/analytics-engagement.attributes';
import { analyticsGrowthAttributes } from '@serializers/attributes/common/analytics-growth.attributes';
import { analyticsHooksAttributes } from '@serializers/attributes/common/analytics-hooks.attributes';
import { analyticsOrgLeaderboardAttributes } from '@serializers/attributes/common/analytics-org-leaderboard.attributes';
import { analyticsOverviewAttributes } from '@serializers/attributes/common/analytics-overview.attributes';
import { analyticsPlatformAttributes } from '@serializers/attributes/common/analytics-platform.attributes';
import {
  analyticsBrandStatsAttributes,
  analyticsOrgStatsAttributes,
  analyticsPaginatedStatsAttributes,
} from '@serializers/attributes/common/analytics-stats.attributes';
import {
  analyticsTimeSeriesAttributes,
  analyticsTimeSeriesWithPlatformsAttributes,
} from '@serializers/attributes/common/analytics-timeseries.attributes';
import { analyticsTopContentAttributes } from '@serializers/attributes/common/analytics-top-content.attributes';
import { analyticsTrendAttributes } from '@serializers/attributes/common/analytics-trend.attributes';
import {
  apiKeyAttributes,
  apiKeyFullAttributes,
} from '@serializers/attributes/common/api-key.attributes';
import { articleAttributes } from '@serializers/attributes/content/article.attributes';
import { bookmarkAttributes } from '@serializers/attributes/content/bookmark.attributes';
import { linkAttributes } from '@serializers/attributes/content/link.attributes';
import { newsAttributes } from '@serializers/attributes/content/news.attributes';
import { personaAttributes } from '@serializers/attributes/content/persona.attributes';
import { postAttributes } from '@serializers/attributes/content/post.attributes';
import { presignedUploadAttributes } from '@serializers/attributes/content/presigned-upload.attributes';
import { templateAttributes } from '@serializers/attributes/content/template.attributes';
import { templateMetadataAttributes } from '@serializers/attributes/content/template-metadata.attributes';
import { transcriptAttributes } from '@serializers/attributes/content/transcript.attributes';
import { contentPatternAttributes } from '@serializers/attributes/content-intelligence/content-pattern.attributes';
import { creatorAnalysisAttributes } from '@serializers/attributes/content-intelligence/creator-analysis.attributes';
import { patternPlaybookAttributes } from '@serializers/attributes/content-intelligence/pattern-playbook.attributes';
import { elementBlacklistAttributes } from '@serializers/attributes/elements/blacklist.attributes';
import { elementCameraAttributes } from '@serializers/attributes/elements/camera.attributes';
import { elementCameraMovementAttributes } from '@serializers/attributes/elements/camera-movement.attributes';
import { captionAttributes } from '@serializers/attributes/elements/caption.attributes';
import {
  commonElementBaseAttributes,
  simpleElementAttributes,
} from '@serializers/attributes/elements/common-element.attributes';
import { fontFamilyAttributes } from '@serializers/attributes/elements/font-family.attributes';
import { elementLensAttributes } from '@serializers/attributes/elements/lens.attributes';
import { elementLightingAttributes } from '@serializers/attributes/elements/lighting.attributes';
import { elementMoodAttributes } from '@serializers/attributes/elements/mood.attributes';
import { presetAttributes } from '@serializers/attributes/elements/preset.attributes';
import { elementSceneAttributes } from '@serializers/attributes/elements/scene.attributes';
import { soundAttributes } from '@serializers/attributes/elements/sound.attributes';
import { elementStyleAttributes } from '@serializers/attributes/elements/style.attributes';
import { voiceAttributes } from '@serializers/attributes/elements/voice.attributes';
import { assetAttributes } from '@serializers/attributes/ingredients/asset.attributes';
import { avatarAttributes } from '@serializers/attributes/ingredients/avatar.attributes';
import { gifAttributes } from '@serializers/attributes/ingredients/gif.attributes';
import {
  imageAttributes,
  imageEditAttributes,
} from '@serializers/attributes/ingredients/image.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { musicAttributes } from '@serializers/attributes/ingredients/music.attributes';
import {
  videoAttributes,
  videoCaptionAttributes,
  videoEditAttributes,
} from '@serializers/attributes/ingredients/video.attributes';
import {
  heygenAvatarAttributes,
  heygenServiceAttributes,
  heygenVoiceAttributes,
} from '@serializers/attributes/integrations/heygen.attributes';
import { serviceAttributes } from '@serializers/attributes/integrations/service.attributes';
import {
  stripeCheckoutAttributes,
  stripeUrlAttributes,
} from '@serializers/attributes/integrations/stripe.attributes';
import { folderAttributes } from '@serializers/attributes/management/folder.attributes';
import { tagAttributes } from '@serializers/attributes/management/tag.attributes';
import { brandAttributes } from '@serializers/attributes/organizations/brand.attributes';
import {
  credentialAttributes,
  credentialFullAttributes,
  credentialInstagramAttributes,
  credentialOAuthAttributes,
} from '@serializers/attributes/organizations/credential.attributes';
import { knowledgeBaseAttributes } from '@serializers/attributes/organizations/knowledge-base.attributes';
import { memberAttributes } from '@serializers/attributes/organizations/member.attributes';
import { organizationAttributes } from '@serializers/attributes/organizations/organization.attributes';
import { organizationSettingsAttributes } from '@serializers/attributes/organizations/organization-settings.attributes';
import { threadAttributes } from '@serializers/attributes/threads/thread.attributes';
import { threadMessageAttributes } from '@serializers/attributes/threads/thread-message.attributes';
import { settingAttributes } from '@serializers/attributes/users/setting.attributes';
import { userAttributes } from '@serializers/attributes/users/user.attributes';
import { describe, expect, it } from 'vitest';

describe('Serializer Attributes', () => {
  describe('taskAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(taskAttributes)).toBe(true);
      expect(taskAttributes.length).toBeGreaterThan(0);
      for (const attr of taskAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('botActivityAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(botActivityAttributes)).toBe(true);
      expect(botActivityAttributes.length).toBeGreaterThan(0);
      for (const attr of botActivityAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('replyBotConfigAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(replyBotConfigAttributes)).toBe(true);
      expect(replyBotConfigAttributes.length).toBeGreaterThan(0);
      for (const attr of replyBotConfigAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('botAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(botAttributes)).toBe(true);
      expect(botAttributes.length).toBeGreaterThan(0);
      for (const attr of botAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('monitoredAccountAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(monitoredAccountAttributes)).toBe(true);
      expect(monitoredAccountAttributes.length).toBeGreaterThan(0);
      for (const attr of monitoredAccountAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('workflowAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(workflowAttributes)).toBe(true);
      expect(workflowAttributes.length).toBeGreaterThan(0);
      for (const attr of workflowAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('evaluationAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(evaluationAttributes)).toBe(true);
      expect(evaluationAttributes.length).toBeGreaterThan(0);
      for (const attr of evaluationAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('watchlistAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(watchlistAttributes)).toBe(true);
      expect(watchlistAttributes.length).toBeGreaterThan(0);
      for (const attr of watchlistAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('stripeCheckoutAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(stripeCheckoutAttributes)).toBe(true);
      expect(stripeCheckoutAttributes.length).toBeGreaterThan(0);
      for (const attr of stripeCheckoutAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('stripeUrlAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(stripeUrlAttributes)).toBe(true);
      expect(stripeUrlAttributes.length).toBeGreaterThan(0);
      for (const attr of stripeUrlAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('serviceAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(serviceAttributes)).toBe(true);
      expect(serviceAttributes.length).toBeGreaterThan(0);
      for (const attr of serviceAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('heygenServiceAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(heygenServiceAttributes)).toBe(true);
      expect(heygenServiceAttributes.length).toBeGreaterThan(0);
      for (const attr of heygenServiceAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('heygenVoiceAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(heygenVoiceAttributes)).toBe(true);
      expect(heygenVoiceAttributes.length).toBeGreaterThan(0);
      for (const attr of heygenVoiceAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('heygenAvatarAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(heygenAvatarAttributes)).toBe(true);
      expect(heygenAvatarAttributes.length).toBeGreaterThan(0);
      for (const attr of heygenAvatarAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsAttributes)).toBe(true);
      expect(analyticsAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsGrowthAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsGrowthAttributes)).toBe(true);
      expect(analyticsGrowthAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsGrowthAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsBrandLeaderboardAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsBrandLeaderboardAttributes)).toBe(true);
      expect(analyticsBrandLeaderboardAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsBrandLeaderboardAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('apiKeyFullAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(apiKeyFullAttributes)).toBe(true);
      expect(apiKeyFullAttributes.length).toBeGreaterThan(0);
      for (const attr of apiKeyFullAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('apiKeyAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(apiKeyAttributes)).toBe(true);
      expect(apiKeyAttributes.length).toBeGreaterThan(0);
      for (const attr of apiKeyAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsHooksAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsHooksAttributes)).toBe(true);
      expect(analyticsHooksAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsHooksAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsTopContentAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsTopContentAttributes)).toBe(true);
      expect(analyticsTopContentAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsTopContentAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsEngagementAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsEngagementAttributes)).toBe(true);
      expect(analyticsEngagementAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsEngagementAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsTrendAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsTrendAttributes)).toBe(true);
      expect(analyticsTrendAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsTrendAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsOverviewAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsOverviewAttributes)).toBe(true);
      expect(analyticsOverviewAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsOverviewAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('activityAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(activityAttributes)).toBe(true);
      expect(activityAttributes.length).toBeGreaterThan(0);
      for (const attr of activityAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('activityBulkPatchAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(activityBulkPatchAttributes)).toBe(true);
      expect(activityBulkPatchAttributes.length).toBeGreaterThan(0);
      for (const attr of activityBulkPatchAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsPaginatedStatsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsPaginatedStatsAttributes)).toBe(true);
      expect(analyticsPaginatedStatsAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsPaginatedStatsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsOrgStatsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsOrgStatsAttributes)).toBe(true);
      expect(analyticsOrgStatsAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsOrgStatsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsBrandStatsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsBrandStatsAttributes)).toBe(true);
      expect(analyticsBrandStatsAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsBrandStatsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsOrgLeaderboardAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsOrgLeaderboardAttributes)).toBe(true);
      expect(analyticsOrgLeaderboardAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsOrgLeaderboardAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsPlatformAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsPlatformAttributes)).toBe(true);
      expect(analyticsPlatformAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsPlatformAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsTimeSeriesAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsTimeSeriesAttributes)).toBe(true);
      expect(analyticsTimeSeriesAttributes.length).toBeGreaterThan(0);
      for (const attr of analyticsTimeSeriesAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('analyticsTimeSeriesWithPlatformsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(analyticsTimeSeriesWithPlatformsAttributes)).toBe(
        true,
      );
      expect(analyticsTimeSeriesWithPlatformsAttributes.length).toBeGreaterThan(
        0,
      );
      for (const attr of analyticsTimeSeriesWithPlatformsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('knowledgeBaseAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(knowledgeBaseAttributes)).toBe(true);
      expect(knowledgeBaseAttributes.length).toBeGreaterThan(0);
      for (const attr of knowledgeBaseAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('organizationAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(organizationAttributes)).toBe(true);
      expect(organizationAttributes.length).toBeGreaterThan(0);
      for (const attr of organizationAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('organizationSettingsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(organizationSettingsAttributes)).toBe(true);
      expect(organizationSettingsAttributes.length).toBeGreaterThan(0);
      for (const attr of organizationSettingsAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('credentialFullAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(credentialFullAttributes)).toBe(true);
      expect(credentialFullAttributes.length).toBeGreaterThan(0);
      for (const attr of credentialFullAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('credentialAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(credentialAttributes)).toBe(true);
      expect(credentialAttributes.length).toBeGreaterThan(0);
      for (const attr of credentialAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('credentialInstagramAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(credentialInstagramAttributes)).toBe(true);
      expect(credentialInstagramAttributes.length).toBeGreaterThan(0);
      for (const attr of credentialInstagramAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('credentialOAuthAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(credentialOAuthAttributes)).toBe(true);
      expect(credentialOAuthAttributes.length).toBeGreaterThan(0);
      for (const attr of credentialOAuthAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('memberAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(memberAttributes)).toBe(true);
      expect(memberAttributes.length).toBeGreaterThan(0);
      for (const attr of memberAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('brandAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(brandAttributes)).toBe(true);
      expect(brandAttributes.length).toBeGreaterThan(0);
      for (const attr of brandAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('trainingAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(trainingAttributes)).toBe(true);
      expect(trainingAttributes.length).toBeGreaterThan(0);
      for (const attr of trainingAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('modelAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(modelAttributes)).toBe(true);
      expect(modelAttributes.length).toBeGreaterThan(0);
      for (const attr of modelAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('trendAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(trendAttributes)).toBe(true);
      expect(trendAttributes.length).toBeGreaterThan(0);
      for (const attr of trendAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('roleAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(roleAttributes)).toBe(true);
      expect(roleAttributes.length).toBeGreaterThan(0);
      for (const attr of roleAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('voteAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(voteAttributes)).toBe(true);
      expect(voteAttributes.length).toBeGreaterThan(0);
      for (const attr of voteAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('promptAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(promptAttributes)).toBe(true);
      expect(promptAttributes.length).toBeGreaterThan(0);
      for (const attr of promptAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('folderAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(folderAttributes)).toBe(true);
      expect(folderAttributes.length).toBeGreaterThan(0);
      for (const attr of folderAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('tagAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(tagAttributes)).toBe(true);
      expect(tagAttributes.length).toBeGreaterThan(0);
      for (const attr of tagAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('settingAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(settingAttributes)).toBe(true);
      expect(settingAttributes.length).toBeGreaterThan(0);
      for (const attr of settingAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('userAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(userAttributes)).toBe(true);
      expect(userAttributes.length).toBeGreaterThan(0);
      for (const attr of userAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('imageAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(imageAttributes)).toBe(true);
      expect(imageAttributes.length).toBeGreaterThan(0);
      for (const attr of imageAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('imageEditAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(imageEditAttributes)).toBe(true);
      expect(imageEditAttributes.length).toBeGreaterThan(0);
      for (const attr of imageEditAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('videoAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(videoAttributes)).toBe(true);
      expect(videoAttributes.length).toBeGreaterThan(0);
      for (const attr of videoAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('videoEditAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(videoEditAttributes)).toBe(true);
      expect(videoEditAttributes.length).toBeGreaterThan(0);
      for (const attr of videoEditAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('videoCaptionAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(videoCaptionAttributes)).toBe(true);
      expect(videoCaptionAttributes.length).toBeGreaterThan(0);
      for (const attr of videoCaptionAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('metadataAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(metadataAttributes)).toBe(true);
      expect(metadataAttributes.length).toBeGreaterThan(0);
      for (const attr of metadataAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('musicAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(musicAttributes)).toBe(true);
      expect(musicAttributes.length).toBeGreaterThan(0);
      for (const attr of musicAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('ingredientAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(ingredientAttributes)).toBe(true);
      expect(ingredientAttributes.length).toBeGreaterThan(0);
      for (const attr of ingredientAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('gifAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(gifAttributes)).toBe(true);
      expect(gifAttributes.length).toBeGreaterThan(0);
      for (const attr of gifAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('avatarAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(avatarAttributes)).toBe(true);
      expect(avatarAttributes.length).toBeGreaterThan(0);
      for (const attr of avatarAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('assetAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(assetAttributes)).toBe(true);
      expect(assetAttributes.length).toBeGreaterThan(0);
      for (const attr of assetAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('presignedUploadAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(presignedUploadAttributes)).toBe(true);
      expect(presignedUploadAttributes.length).toBeGreaterThan(0);
      for (const attr of presignedUploadAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('templateAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(templateAttributes)).toBe(true);
      expect(templateAttributes.length).toBeGreaterThan(0);
      for (const attr of templateAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('bookmarkAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(bookmarkAttributes)).toBe(true);
      expect(bookmarkAttributes.length).toBeGreaterThan(0);
      for (const attr of bookmarkAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('templateMetadataAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(templateMetadataAttributes)).toBe(true);
      expect(templateMetadataAttributes.length).toBeGreaterThan(0);
      for (const attr of templateMetadataAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('newsAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(newsAttributes)).toBe(true);
      expect(newsAttributes.length).toBeGreaterThan(0);
      for (const attr of newsAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('personaAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(personaAttributes)).toBe(true);
      expect(personaAttributes.length).toBeGreaterThan(0);
      for (const attr of personaAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('transcriptAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(transcriptAttributes)).toBe(true);
      expect(transcriptAttributes.length).toBeGreaterThan(0);
      for (const attr of transcriptAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('postAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(postAttributes)).toBe(true);
      expect(postAttributes.length).toBeGreaterThan(0);
      for (const attr of postAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('linkAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(linkAttributes)).toBe(true);
      expect(linkAttributes.length).toBeGreaterThan(0);
      for (const attr of linkAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('articleAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(articleAttributes)).toBe(true);
      expect(articleAttributes.length).toBeGreaterThan(0);
      for (const attr of articleAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('threadMessageAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(threadMessageAttributes)).toBe(true);
      expect(threadMessageAttributes.length).toBeGreaterThan(0);
      for (const attr of threadMessageAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('threadAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(threadAttributes)).toBe(true);
      expect(threadAttributes.length).toBeGreaterThan(0);
      for (const attr of threadAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('subscriptionPreviewAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(subscriptionPreviewAttributes)).toBe(true);
      expect(subscriptionPreviewAttributes.length).toBeGreaterThan(0);
      for (const attr of subscriptionPreviewAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('subscriptionAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(subscriptionAttributes)).toBe(true);
      expect(subscriptionAttributes.length).toBeGreaterThan(0);
      for (const attr of subscriptionAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementCameraMovementAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementCameraMovementAttributes)).toBe(true);
      expect(elementCameraMovementAttributes.length).toBeGreaterThan(0);
      for (const attr of elementCameraMovementAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('soundAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(soundAttributes)).toBe(true);
      expect(soundAttributes.length).toBeGreaterThan(0);
      for (const attr of soundAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('fontFamilyAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(fontFamilyAttributes)).toBe(true);
      expect(fontFamilyAttributes.length).toBeGreaterThan(0);
      for (const attr of fontFamilyAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('commonElementBaseAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(commonElementBaseAttributes)).toBe(true);
      expect(commonElementBaseAttributes.length).toBeGreaterThan(0);
      for (const attr of commonElementBaseAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('simpleElementAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(simpleElementAttributes)).toBe(true);
      expect(simpleElementAttributes.length).toBeGreaterThan(0);
      for (const attr of simpleElementAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementBlacklistAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementBlacklistAttributes)).toBe(true);
      expect(elementBlacklistAttributes.length).toBeGreaterThan(0);
      for (const attr of elementBlacklistAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementMoodAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementMoodAttributes)).toBe(true);
      expect(elementMoodAttributes.length).toBeGreaterThan(0);
      for (const attr of elementMoodAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementLensAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementLensAttributes)).toBe(true);
      expect(elementLensAttributes.length).toBeGreaterThan(0);
      for (const attr of elementLensAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementLightingAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementLightingAttributes)).toBe(true);
      expect(elementLightingAttributes.length).toBeGreaterThan(0);
      for (const attr of elementLightingAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('captionAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(captionAttributes)).toBe(true);
      expect(captionAttributes.length).toBeGreaterThan(0);
      for (const attr of captionAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('presetAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(presetAttributes)).toBe(true);
      expect(presetAttributes.length).toBeGreaterThan(0);
      for (const attr of presetAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('elementStyleAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementStyleAttributes)).toBe(true);
      expect(elementStyleAttributes.length).toBeGreaterThan(0);
      for (const attr of elementStyleAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('voiceAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(voiceAttributes)).toBe(true);
      expect(voiceAttributes.length).toBeGreaterThan(0);
      for (const attr of voiceAttributes) expect(typeof attr).toBe('string');
    });
  });

  describe('elementSceneAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementSceneAttributes)).toBe(true);
      expect(elementSceneAttributes.length).toBeGreaterThan(0);
      for (const attr of elementSceneAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('elementCameraAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(elementCameraAttributes)).toBe(true);
      expect(elementCameraAttributes.length).toBeGreaterThan(0);
      for (const attr of elementCameraAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('patternPlaybookAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(patternPlaybookAttributes)).toBe(true);
      expect(patternPlaybookAttributes.length).toBeGreaterThan(0);
      for (const attr of patternPlaybookAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('creatorAnalysisAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(creatorAnalysisAttributes)).toBe(true);
      expect(creatorAnalysisAttributes.length).toBeGreaterThan(0);
      for (const attr of creatorAnalysisAttributes)
        expect(typeof attr).toBe('string');
    });
  });

  describe('contentPatternAttributes', () => {
    it('should be a non-empty array of strings', () => {
      expect(Array.isArray(contentPatternAttributes)).toBe(true);
      expect(contentPatternAttributes.length).toBeGreaterThan(0);
      for (const attr of contentPatternAttributes)
        expect(typeof attr).toBe('string');
    });
  });
});
