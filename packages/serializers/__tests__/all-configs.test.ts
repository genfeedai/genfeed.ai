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
  analyticsTimeSeriesSerializerConfig,
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
import {
  postAnalyticsSerializerConfig,
  postSerializerConfig,
} from '@serializers/configs/content/post.config';
import { presignedUploadSerializerConfig } from '@serializers/configs/content/presigned-upload.config';
import {
  templateMetadataSerializerConfig,
  templateSerializerConfig,
} from '@serializers/configs/content/template.config';
import { transcriptSerializerConfig } from '@serializers/configs/content/transcript.config';
import {
  videoCaptionSerializerConfig,
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '@serializers/configs/content/video.config';
import { contentPatternSerializerConfig } from '@serializers/configs/content-intelligence/content-pattern.config';
import { creatorAnalysisSerializerConfig } from '@serializers/configs/content-intelligence/creator-analysis.config';
import { patternPlaybookSerializerConfig } from '@serializers/configs/content-intelligence/pattern-playbook.config';
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
import { gifSerializerConfig } from '@serializers/configs/ingredients/gif.config';
import { imageSerializerConfig } from '@serializers/configs/ingredients/image.config';
import { metadataSerializerConfig } from '@serializers/configs/ingredients/metadata.config';
import { musicSerializerConfig } from '@serializers/configs/ingredients/music.config';
import {
  heygenAvatarSerializerConfig,
  heygenServiceSerializerConfig,
  heygenVoiceSerializerConfig,
} from '@serializers/configs/integrations/heygen.config';
import { serviceOAuthSerializerConfig } from '@serializers/configs/integrations/service.config';
import { serviceSerializerConfig } from '@serializers/configs/integrations/service-server.config';
import {
  stripeCheckoutSerializerConfig,
  stripeUrlSerializerConfig,
} from '@serializers/configs/integrations/stripe.config';
import { folderSerializerConfig } from '@serializers/configs/management/folder.config';
import { tagSerializerConfig } from '@serializers/configs/management/tag.config';
import { brandSerializerConfig } from '@serializers/configs/organizations/brand.config';
import { knowledgeBaseSerializerConfig } from '@serializers/configs/organizations/knowledge-base.config';
import { organizationSerializerConfig } from '@serializers/configs/organizations/organization.config';
import { organizationSettingsSerializerConfig } from '@serializers/configs/organizations/organization-settings.config';
import { threadSerializerConfig } from '@serializers/configs/threads/thread.config';
import { threadMessageSerializerConfig } from '@serializers/configs/threads/thread-message.config';
import { settingSerializerConfig } from '@serializers/configs/users/setting.config';
import { userSerializerConfig } from '@serializers/configs/users/user.config';
import { describe, expect, it } from 'vitest';

describe('Serializer Configs', () => {
  describe('replyBotConfigSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof replyBotConfigSerializerConfig.type).toBe('string');
      expect(replyBotConfigSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(replyBotConfigSerializerConfig.attributes)).toBe(
        true,
      );
      expect(replyBotConfigSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(replyBotConfigSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('botSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof botSerializerConfig.type).toBe('string');
      expect(botSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(botSerializerConfig.attributes)).toBe(true);
      expect(botSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(botSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('workflowSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof workflowSerializerConfig.type).toBe('string');
      expect(workflowSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(workflowSerializerConfig.attributes)).toBe(true);
      expect(workflowSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(workflowSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('monitoredAccountSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof monitoredAccountSerializerConfig.type).toBe('string');
      expect(monitoredAccountSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(monitoredAccountSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        monitoredAccountSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        monitoredAccountSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('botActivitySerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof botActivitySerializerConfig.type).toBe('string');
      expect(botActivitySerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(botActivitySerializerConfig.attributes)).toBe(true);
      expect(botActivitySerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(botActivitySerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('evaluationSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof evaluationSerializerConfig.type).toBe('string');
      expect(evaluationSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(evaluationSerializerConfig.attributes)).toBe(true);
      expect(evaluationSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(evaluationSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('watchlistSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof watchlistSerializerConfig.type).toBe('string');
      expect(watchlistSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(watchlistSerializerConfig.attributes)).toBe(true);
      expect(watchlistSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(watchlistSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('stripeCheckoutSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof stripeCheckoutSerializerConfig.type).toBe('string');
      expect(stripeCheckoutSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(stripeCheckoutSerializerConfig.attributes)).toBe(
        true,
      );
      expect(stripeCheckoutSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(stripeCheckoutSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('stripeUrlSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof stripeUrlSerializerConfig.type).toBe('string');
      expect(stripeUrlSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(stripeUrlSerializerConfig.attributes)).toBe(true);
      expect(stripeUrlSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(stripeUrlSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('serviceSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof serviceSerializerConfig.type).toBe('string');
      expect(serviceSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(serviceSerializerConfig.attributes)).toBe(true);
      expect(serviceSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(serviceSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('heygenServiceSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof heygenServiceSerializerConfig.type).toBe('string');
      expect(heygenServiceSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(heygenServiceSerializerConfig.attributes)).toBe(
        true,
      );
      expect(heygenServiceSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(heygenServiceSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('heygenVoiceSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof heygenVoiceSerializerConfig.type).toBe('string');
      expect(heygenVoiceSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(heygenVoiceSerializerConfig.attributes)).toBe(true);
      expect(heygenVoiceSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(heygenVoiceSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('heygenAvatarSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof heygenAvatarSerializerConfig.type).toBe('string');
      expect(heygenAvatarSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(heygenAvatarSerializerConfig.attributes)).toBe(true);
      expect(heygenAvatarSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(heygenAvatarSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('serviceOAuthSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof serviceOAuthSerializerConfig.type).toBe('string');
      expect(serviceOAuthSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(serviceOAuthSerializerConfig.attributes)).toBe(true);
      expect(serviceOAuthSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(serviceOAuthSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('activitySerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof activitySerializerConfig.type).toBe('string');
      expect(activitySerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(activitySerializerConfig.attributes)).toBe(true);
      expect(activitySerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(activitySerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('activityBulkPatchSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof activityBulkPatchSerializerConfig.type).toBe('string');
      expect(activityBulkPatchSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(activityBulkPatchSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        activityBulkPatchSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        activityBulkPatchSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('apiKeySerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof apiKeySerializerConfig.type).toBe('string');
      expect(apiKeySerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(apiKeySerializerConfig.attributes)).toBe(true);
      expect(apiKeySerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(apiKeySerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('apiKeyFullSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof apiKeyFullSerializerConfig.type).toBe('string');
      expect(apiKeyFullSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(apiKeyFullSerializerConfig.attributes)).toBe(true);
      expect(apiKeyFullSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(apiKeyFullSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsSerializerConfig.type).toBe('string');
      expect(analyticsSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsSerializerConfig.attributes)).toBe(true);
      expect(analyticsSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(analyticsSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsTimeSeriesSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsTimeSeriesSerializerConfig.type).toBe('string');
      expect(analyticsTimeSeriesSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(analyticsTimeSeriesSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsTimeSeriesSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsTimeSeriesSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsTimeSeriesWithPlatformsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsTimeSeriesWithPlatformsSerializerConfig.type).toBe(
        'string',
      );
      expect(
        analyticsTimeSeriesWithPlatformsSerializerConfig.type.length,
      ).toBeGreaterThan(0);
      expect(
        Array.isArray(
          analyticsTimeSeriesWithPlatformsSerializerConfig.attributes,
        ),
      ).toBe(true);
      expect(
        analyticsTimeSeriesWithPlatformsSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsTimeSeriesWithPlatformsSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsPlatformSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsPlatformSerializerConfig.type).toBe('string');
      expect(analyticsPlatformSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsPlatformSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        analyticsPlatformSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsPlatformSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsTopContentSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsTopContentSerializerConfig.type).toBe('string');
      expect(analyticsTopContentSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(analyticsTopContentSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsTopContentSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsTopContentSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsOrgLeaderboardSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsOrgLeaderboardSerializerConfig.type).toBe(
        'string',
      );
      expect(
        analyticsOrgLeaderboardSerializerConfig.type.length,
      ).toBeGreaterThan(0);
      expect(
        Array.isArray(analyticsOrgLeaderboardSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsOrgLeaderboardSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsOrgLeaderboardSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsBrandLeaderboardSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsBrandLeaderboardSerializerConfig.type).toBe(
        'string',
      );
      expect(
        analyticsBrandLeaderboardSerializerConfig.type.length,
      ).toBeGreaterThan(0);
      expect(
        Array.isArray(analyticsBrandLeaderboardSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsBrandLeaderboardSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsBrandLeaderboardSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsOrgStatsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsOrgStatsSerializerConfig.type).toBe('string');
      expect(analyticsOrgStatsSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsOrgStatsSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        analyticsOrgStatsSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsOrgStatsSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsBrandStatsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsBrandStatsSerializerConfig.type).toBe('string');
      expect(analyticsBrandStatsSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(analyticsBrandStatsSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsBrandStatsSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsBrandStatsSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsOverviewSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsOverviewSerializerConfig.type).toBe('string');
      expect(analyticsOverviewSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsOverviewSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        analyticsOverviewSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsOverviewSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsGrowthSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsGrowthSerializerConfig.type).toBe('string');
      expect(analyticsGrowthSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsGrowthSerializerConfig.attributes)).toBe(
        true,
      );
      expect(analyticsGrowthSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsGrowthSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsEngagementSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsEngagementSerializerConfig.type).toBe('string');
      expect(analyticsEngagementSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(analyticsEngagementSerializerConfig.attributes),
      ).toBe(true);
      expect(
        analyticsEngagementSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        analyticsEngagementSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsHooksSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsHooksSerializerConfig.type).toBe('string');
      expect(analyticsHooksSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsHooksSerializerConfig.attributes)).toBe(
        true,
      );
      expect(analyticsHooksSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(analyticsHooksSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('analyticsTrendSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof analyticsTrendSerializerConfig.type).toBe('string');
      expect(analyticsTrendSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(analyticsTrendSerializerConfig.attributes)).toBe(
        true,
      );
      expect(analyticsTrendSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(analyticsTrendSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('brandSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof brandSerializerConfig.type).toBe('string');
      expect(brandSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(brandSerializerConfig.attributes)).toBe(true);
      expect(brandSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(brandSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('organizationSettingsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof organizationSettingsSerializerConfig.type).toBe('string');
      expect(organizationSettingsSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(organizationSettingsSerializerConfig.attributes),
      ).toBe(true);
      expect(
        organizationSettingsSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        organizationSettingsSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('organizationSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof organizationSerializerConfig.type).toBe('string');
      expect(organizationSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(organizationSerializerConfig.attributes)).toBe(true);
      expect(organizationSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(organizationSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('knowledgeBaseSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof knowledgeBaseSerializerConfig.type).toBe('string');
      expect(knowledgeBaseSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(knowledgeBaseSerializerConfig.attributes)).toBe(
        true,
      );
      expect(knowledgeBaseSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(knowledgeBaseSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('roleSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof roleSerializerConfig.type).toBe('string');
      expect(roleSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(roleSerializerConfig.attributes)).toBe(true);
      expect(roleSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(roleSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('modelSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof modelSerializerConfig.type).toBe('string');
      expect(modelSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(modelSerializerConfig.attributes)).toBe(true);
      expect(modelSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(modelSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('promptSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof promptSerializerConfig.type).toBe('string');
      expect(promptSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(promptSerializerConfig.attributes)).toBe(true);
      expect(promptSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(promptSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('trainingSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof trainingSerializerConfig.type).toBe('string');
      expect(trainingSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(trainingSerializerConfig.attributes)).toBe(true);
      expect(trainingSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(trainingSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('trendSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof trendSerializerConfig.type).toBe('string');
      expect(trendSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(trendSerializerConfig.attributes)).toBe(true);
      expect(trendSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(trendSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('voteSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof voteSerializerConfig.type).toBe('string');
      expect(voteSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(voteSerializerConfig.attributes)).toBe(true);
      expect(voteSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(voteSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('folderSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof folderSerializerConfig.type).toBe('string');
      expect(folderSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(folderSerializerConfig.attributes)).toBe(true);
      expect(folderSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(folderSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('tagSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof tagSerializerConfig.type).toBe('string');
      expect(tagSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(tagSerializerConfig.attributes)).toBe(true);
      expect(tagSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(tagSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('settingSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof settingSerializerConfig.type).toBe('string');
      expect(settingSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(settingSerializerConfig.attributes)).toBe(true);
      expect(settingSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(settingSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('userSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof userSerializerConfig.type).toBe('string');
      expect(userSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(userSerializerConfig.attributes)).toBe(true);
      expect(userSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(userSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('metadataSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof metadataSerializerConfig.type).toBe('string');
      expect(metadataSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(metadataSerializerConfig.attributes)).toBe(true);
      expect(metadataSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(metadataSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('assetSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof assetSerializerConfig.type).toBe('string');
      expect(assetSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(assetSerializerConfig.attributes)).toBe(true);
      expect(assetSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(assetSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('musicSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof musicSerializerConfig.type).toBe('string');
      expect(musicSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(musicSerializerConfig.attributes)).toBe(true);
      expect(musicSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(musicSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('imageSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof imageSerializerConfig.type).toBe('string');
      expect(imageSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(imageSerializerConfig.attributes)).toBe(true);
      expect(imageSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(imageSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('gifSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof gifSerializerConfig.type).toBe('string');
      expect(gifSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(gifSerializerConfig.attributes)).toBe(true);
      expect(gifSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(gifSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('avatarSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof avatarSerializerConfig.type).toBe('string');
      expect(avatarSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(avatarSerializerConfig.attributes)).toBe(true);
      expect(avatarSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(avatarSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('presignedUploadSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof presignedUploadSerializerConfig.type).toBe('string');
      expect(presignedUploadSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(presignedUploadSerializerConfig.attributes)).toBe(
        true,
      );
      expect(presignedUploadSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        presignedUploadSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('templateSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof templateSerializerConfig.type).toBe('string');
      expect(templateSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(templateSerializerConfig.attributes)).toBe(true);
      expect(templateSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(templateSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('templateMetadataSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof templateMetadataSerializerConfig.type).toBe('string');
      expect(templateMetadataSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(templateMetadataSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        templateMetadataSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        templateMetadataSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('articleSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof articleSerializerConfig.type).toBe('string');
      expect(articleSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(articleSerializerConfig.attributes)).toBe(true);
      expect(articleSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(articleSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('ingredientSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof ingredientSerializerConfig.type).toBe('string');
      expect(ingredientSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(ingredientSerializerConfig.attributes)).toBe(true);
      expect(ingredientSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(ingredientSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('ingredientBulkDeleteSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof ingredientBulkDeleteSerializerConfig.type).toBe('string');
      expect(ingredientBulkDeleteSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(ingredientBulkDeleteSerializerConfig.attributes),
      ).toBe(true);
      expect(
        ingredientBulkDeleteSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        ingredientBulkDeleteSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('ingredientUploadSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof ingredientUploadSerializerConfig.type).toBe('string');
      expect(ingredientUploadSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(ingredientUploadSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        ingredientUploadSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        ingredientUploadSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('ingredientMergeSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof ingredientMergeSerializerConfig.type).toBe('string');
      expect(ingredientMergeSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(ingredientMergeSerializerConfig.attributes)).toBe(
        true,
      );
      expect(ingredientMergeSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        ingredientMergeSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('transcriptSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof transcriptSerializerConfig.type).toBe('string');
      expect(transcriptSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(transcriptSerializerConfig.attributes)).toBe(true);
      expect(transcriptSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(transcriptSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('videoSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof videoSerializerConfig.type).toBe('string');
      expect(videoSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(videoSerializerConfig.attributes)).toBe(true);
      expect(videoSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(videoSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('videoEditSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof videoEditSerializerConfig.type).toBe('string');
      expect(videoEditSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(videoEditSerializerConfig.attributes)).toBe(true);
      expect(videoEditSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(videoEditSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('videoCaptionSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof videoCaptionSerializerConfig.type).toBe('string');
      expect(videoCaptionSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(videoCaptionSerializerConfig.attributes)).toBe(true);
      expect(videoCaptionSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(videoCaptionSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('personaSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof personaSerializerConfig.type).toBe('string');
      expect(personaSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(personaSerializerConfig.attributes)).toBe(true);
      expect(personaSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(personaSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('newsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof newsSerializerConfig.type).toBe('string');
      expect(newsSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(newsSerializerConfig.attributes)).toBe(true);
      expect(newsSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(newsSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('postSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof postSerializerConfig.type).toBe('string');
      expect(postSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(postSerializerConfig.attributes)).toBe(true);
      expect(postSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(postSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('postAnalyticsSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof postAnalyticsSerializerConfig.type).toBe('string');
      expect(postAnalyticsSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(postAnalyticsSerializerConfig.attributes)).toBe(
        true,
      );
      expect(postAnalyticsSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(postAnalyticsSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('bookmarkSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof bookmarkSerializerConfig.type).toBe('string');
      expect(bookmarkSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(bookmarkSerializerConfig.attributes)).toBe(true);
      expect(bookmarkSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(bookmarkSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('linkSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof linkSerializerConfig.type).toBe('string');
      expect(linkSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(linkSerializerConfig.attributes)).toBe(true);
      expect(linkSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(linkSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('threadSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof threadSerializerConfig.type).toBe('string');
      expect(threadSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(threadSerializerConfig.attributes)).toBe(true);
      expect(threadSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(threadSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('threadMessageSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof threadMessageSerializerConfig.type).toBe('string');
      expect(threadMessageSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(threadMessageSerializerConfig.attributes)).toBe(
        true,
      );
      expect(threadMessageSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(threadMessageSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('subscriptionSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof subscriptionSerializerConfig.type).toBe('string');
      expect(subscriptionSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(subscriptionSerializerConfig.attributes)).toBe(true);
      expect(subscriptionSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(subscriptionSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('subscriptionPreviewSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof subscriptionPreviewSerializerConfig.type).toBe('string');
      expect(subscriptionPreviewSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(subscriptionPreviewSerializerConfig.attributes),
      ).toBe(true);
      expect(
        subscriptionPreviewSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        subscriptionPreviewSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementStyleSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementStyleSerializerConfig.type).toBe('string');
      expect(elementStyleSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementStyleSerializerConfig.attributes)).toBe(true);
      expect(elementStyleSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(elementStyleSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('soundSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof soundSerializerConfig.type).toBe('string');
      expect(soundSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(soundSerializerConfig.attributes)).toBe(true);
      expect(soundSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(soundSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('presetSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof presetSerializerConfig.type).toBe('string');
      expect(presetSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(presetSerializerConfig.attributes)).toBe(true);
      expect(presetSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(presetSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementSceneSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementSceneSerializerConfig.type).toBe('string');
      expect(elementSceneSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementSceneSerializerConfig.attributes)).toBe(true);
      expect(elementSceneSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(elementSceneSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('captionSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof captionSerializerConfig.type).toBe('string');
      expect(captionSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(captionSerializerConfig.attributes)).toBe(true);
      expect(captionSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(captionSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementLensSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementLensSerializerConfig.type).toBe('string');
      expect(elementLensSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementLensSerializerConfig.attributes)).toBe(true);
      expect(elementLensSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(elementLensSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementLightingSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementLightingSerializerConfig.type).toBe('string');
      expect(elementLightingSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementLightingSerializerConfig.attributes)).toBe(
        true,
      );
      expect(elementLightingSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        elementLightingSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementBlacklistSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementBlacklistSerializerConfig.type).toBe('string');
      expect(elementBlacklistSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementBlacklistSerializerConfig.attributes)).toBe(
        true,
      );
      expect(
        elementBlacklistSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        elementBlacklistSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementCameraSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementCameraSerializerConfig.type).toBe('string');
      expect(elementCameraSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementCameraSerializerConfig.attributes)).toBe(
        true,
      );
      expect(elementCameraSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(elementCameraSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementCameraMovementSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementCameraMovementSerializerConfig.type).toBe('string');
      expect(elementCameraMovementSerializerConfig.type.length).toBeGreaterThan(
        0,
      );
      expect(
        Array.isArray(elementCameraMovementSerializerConfig.attributes),
      ).toBe(true);
      expect(
        elementCameraMovementSerializerConfig.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        elementCameraMovementSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('fontFamilySerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof fontFamilySerializerConfig.type).toBe('string');
      expect(fontFamilySerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(fontFamilySerializerConfig.attributes)).toBe(true);
      expect(fontFamilySerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(fontFamilySerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('elementMoodSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof elementMoodSerializerConfig.type).toBe('string');
      expect(elementMoodSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(elementMoodSerializerConfig.attributes)).toBe(true);
      expect(elementMoodSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(elementMoodSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('voiceSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof voiceSerializerConfig.type).toBe('string');
      expect(voiceSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(voiceSerializerConfig.attributes)).toBe(true);
      expect(voiceSerializerConfig.attributes.length).toBeGreaterThan(0);
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(voiceSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('creatorAnalysisSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof creatorAnalysisSerializerConfig.type).toBe('string');
      expect(creatorAnalysisSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(creatorAnalysisSerializerConfig.attributes)).toBe(
        true,
      );
      expect(creatorAnalysisSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        creatorAnalysisSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('patternPlaybookSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof patternPlaybookSerializerConfig.type).toBe('string');
      expect(patternPlaybookSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(patternPlaybookSerializerConfig.attributes)).toBe(
        true,
      );
      expect(patternPlaybookSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(
        patternPlaybookSerializerConfig,
      )) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });

  describe('contentPatternSerializerConfig', () => {
    it('should have type and attributes', () => {
      expect(typeof contentPatternSerializerConfig.type).toBe('string');
      expect(contentPatternSerializerConfig.type.length).toBeGreaterThan(0);
      expect(Array.isArray(contentPatternSerializerConfig.attributes)).toBe(
        true,
      );
      expect(contentPatternSerializerConfig.attributes.length).toBeGreaterThan(
        0,
      );
    });

    it('relationships should have correct structure', () => {
      for (const [key, val] of Object.entries(contentPatternSerializerConfig)) {
        if (key === 'type' || key === 'attributes') continue;
        const rel = val as any;
        if (rel && typeof rel === 'object' && 'type' in rel) {
          expect(typeof rel.type).toBe('string');
          if ('ref' in rel) expect(rel.ref).toBe('_id');
          if ('attributes' in rel)
            expect(Array.isArray(rel.attributes)).toBe(true);
        }
      }
    });
  });
});
