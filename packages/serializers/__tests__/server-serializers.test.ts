import { workflowAttributes } from '@serializers/attributes/automation/workflow.attributes';
import { FleetCloudFrontInvalidationSerializer } from '@serializers/server/admin/fleet-cloud-front-invalidation.serializer';
import { FleetEc2ActionResultSerializer } from '@serializers/server/admin/fleet-ec2-action-result.serializer';
import { FleetEc2BulkActionResultSerializer } from '@serializers/server/admin/fleet-ec2-bulk-action-result.serializer';
import { FleetEc2InstanceSerializer } from '@serializers/server/admin/fleet-ec2-instance.serializer';
import { FleetGenerateVoiceResultSerializer } from '@serializers/server/admin/fleet-generate-voice-result.serializer';
import { FleetGenerationJobSerializer } from '@serializers/server/admin/fleet-generation-job.serializer';
import { FleetHealthSerializer } from '@serializers/server/admin/fleet-health.serializer';
import { FleetLipSyncJobSerializer } from '@serializers/server/admin/fleet-lip-sync-job.serializer';
import { FleetLipSyncStatusSerializer } from '@serializers/server/admin/fleet-lip-sync-status.serializer';
import { FleetPipelineCampaignSerializer } from '@serializers/server/admin/fleet-pipeline-campaign.serializer';
import { FleetPipelineStatsSerializer } from '@serializers/server/admin/fleet-pipeline-stats.serializer';
import { FleetServiceStatusSerializer } from '@serializers/server/admin/fleet-service-status.serializer';
import { FleetUploadDatasetResultSerializer } from '@serializers/server/admin/fleet-upload-dataset-result.serializer';
import { FleetVoiceSerializer } from '@serializers/server/admin/fleet-voice.serializer';
import { EvaluationSerializer } from '@serializers/server/analytics/evaluation.serializer';
import { WatchlistSerializer } from '@serializers/server/analytics/watchlist.serializer';
import { BotSerializer } from '@serializers/server/automation/bot.serializer';
import { WorkflowSerializer } from '@serializers/server/automation/workflow.serializer';
import {
  SubscriptionPreviewSerializer,
  SubscriptionSerializer,
} from '@serializers/server/billing/subscription.serializer';
import { ModelSerializer } from '@serializers/server/collections/model.serializer';
import { RoleSerializer } from '@serializers/server/collections/role.serializer';
import { TrainingSerializer } from '@serializers/server/collections/training.serializer';
import { TrendSerializer } from '@serializers/server/collections/trend.serializer';
import { VoteSerializer } from '@serializers/server/collections/vote.serializer';
import {
  ActivityBulkPatchSerializer,
  ActivitySerializer,
} from '@serializers/server/common/activity.serializer';
import {
  AnalyticSerializer,
  AnalyticsBrandLeaderboardSerializer,
  AnalyticsBrandStatsSerializer,
  AnalyticsEngagementSerializer,
  AnalyticsGrowthSerializer,
  AnalyticsHooksSerializer,
  AnalyticsOrgLeaderboardSerializer,
  AnalyticsOrgStatsSerializer,
  AnalyticsOverviewSerializer,
  AnalyticsPlatformSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  AnalyticsTopContentSerializer,
  AnalyticsTrendSerializer,
} from '@serializers/server/common/analytics.serializer';
import {
  ApiKeyFullSerializer,
  ApiKeySerializer,
} from '@serializers/server/common/api-key.serializer';
import { ArticleSerializer } from '@serializers/server/content/article.serializer';
import { BookmarkSerializer } from '@serializers/server/content/bookmark.serializer';
import { LinkSerializer } from '@serializers/server/content/link.serializer';
import { NewsSerializer } from '@serializers/server/content/news.serializer';
import { PersonaSerializer } from '@serializers/server/content/persona.serializer';
import {
  PostListSerializer,
  PostSerializer,
} from '@serializers/server/content/post.serializer';
import { PresignedUploadSerializer } from '@serializers/server/content/presigned-upload.serializer';
import { TemplateSerializer } from '@serializers/server/content/template.serializer';
import { TranscriptSerializer } from '@serializers/server/content/transcript.serializer';
import { ElementBlacklistSerializer } from '@serializers/server/elements/blacklist.serializer';
import { ElementCameraSerializer } from '@serializers/server/elements/camera.serializer';
import { CameraMovementSerializer } from '@serializers/server/elements/camera-movement.serializer';
import { CaptionSerializer } from '@serializers/server/elements/caption.serializer';
import { FontFamilySerializer } from '@serializers/server/elements/font-family.serializer';
import { ElementLensSerializer } from '@serializers/server/elements/lens.serializer';
import { ElementLightingSerializer } from '@serializers/server/elements/lighting.serializer';
import { ElementMoodSerializer } from '@serializers/server/elements/mood.serializer';
import { PresetSerializer } from '@serializers/server/elements/preset.serializer';
import { SceneSerializer } from '@serializers/server/elements/scene.serializer';
import { SoundSerializer } from '@serializers/server/elements/sound.serializer';
import { ElementStyleSerializer } from '@serializers/server/elements/style.serializer';
import { VoiceSerializer } from '@serializers/server/elements/voice.serializer';
import { AssetSerializer } from '@serializers/server/ingredients/asset.serializer';
import { AvatarSerializer } from '@serializers/server/ingredients/avatar.serializer';
import {
  ImageEditSerializer,
  ImageSerializer,
} from '@serializers/server/ingredients/image.serializer';
import {
  IngredientBulkDeleteSerializer,
  IngredientMergeSerializer,
  IngredientSerializer,
  IngredientUploadSerializer,
} from '@serializers/server/ingredients/ingredient.serializer';
import { MetadataSerializer } from '@serializers/server/ingredients/metadata.serializer';
import { MusicSerializer } from '@serializers/server/ingredients/music.serializer';
import {
  VideoEditSerializer,
  VideoSerializer,
} from '@serializers/server/ingredients/video.serializer';
import { ServiceSerializer } from '@serializers/server/integrations/service.serializer';
import {
  StripeCheckoutSerializer,
  StripeUrlSerializer,
} from '@serializers/server/integrations/stripe.serializer';
import { FolderSerializer } from '@serializers/server/management/folder.serializer';
import { PromptSerializer } from '@serializers/server/management/prompt.serializer';
import { TagSerializer } from '@serializers/server/management/tag.serializer';
import { BrandSerializer } from '@serializers/server/organizations/brand.serializer';
import {
  CredentialInstagramPagesSerializer,
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@serializers/server/organizations/credential.serializer';
import { MemberSerializer } from '@serializers/server/organizations/member.serializer';
import { OrganizationSerializer } from '@serializers/server/organizations/organization.serializer';
import { OrganizationSettingSerializer } from '@serializers/server/organizations/organization-settings.serializer';
import { SettingSerializer } from '@serializers/server/users/setting.serializer';
import { UserSerializer } from '@serializers/server/users/user.serializer';
import { describe, expect, it } from 'vitest';

describe('Server Serializers', () => {
  describe('WorkflowSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof WorkflowSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof WorkflowSerializer.serialize).toBe('function');
    });

    it('includes the visual workflow attributes required by the cloud editor', () => {
      expect(workflowAttributes).toEqual(
        expect.arrayContaining([
          'brand',
          'brandId',
          'edges',
          'inputVariables',
          'lifecycle',
          'lockedNodeIds',
          'nodes',
        ]),
      );
    });
  });

  describe('BotSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof BotSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof BotSerializer.serialize).toBe('function');
    });
  });

  describe('EvaluationSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof EvaluationSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof EvaluationSerializer.serialize).toBe('function');
    });
  });

  describe('WatchlistSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof WatchlistSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof WatchlistSerializer.serialize).toBe('function');
    });
  });

  describe('ServiceSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ServiceSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ServiceSerializer.serialize).toBe('function');
    });
  });

  describe('StripeCheckoutSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof StripeCheckoutSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof StripeCheckoutSerializer.serialize).toBe('function');
    });
  });

  describe('StripeUrlSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof StripeUrlSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof StripeUrlSerializer.serialize).toBe('function');
    });
  });

  describe('ApiKeySerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ApiKeySerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ApiKeySerializer.serialize).toBe('function');
    });
  });

  describe('ApiKeyFullSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ApiKeyFullSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ApiKeyFullSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsBrandLeaderboardSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsBrandLeaderboardSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsBrandLeaderboardSerializer.serialize).toBe(
        'function',
      );
    });
  });

  describe('AnalyticsBrandStatsSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsBrandStatsSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsBrandStatsSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsEngagementSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsEngagementSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsEngagementSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsGrowthSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsGrowthSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsGrowthSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsHooksSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsHooksSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsHooksSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsOrgLeaderboardSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsOrgLeaderboardSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsOrgLeaderboardSerializer.serialize).toBe(
        'function',
      );
    });
  });

  describe('AnalyticsOrgStatsSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsOrgStatsSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsOrgStatsSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsOverviewSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsOverviewSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsOverviewSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsPlatformSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsPlatformSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsPlatformSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsTimeseriesWithPlatformsSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsTimeseriesWithPlatformsSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsTimeseriesWithPlatformsSerializer.serialize).toBe(
        'function',
      );
    });
  });

  describe('AnalyticsTopContentSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsTopContentSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsTopContentSerializer.serialize).toBe('function');
    });
  });

  describe('AnalyticsTrendSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AnalyticsTrendSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AnalyticsTrendSerializer.serialize).toBe('function');
    });
  });

  describe('ActivitySerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ActivitySerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ActivitySerializer.serialize).toBe('function');
    });
  });

  describe('ActivityBulkPatchSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ActivityBulkPatchSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ActivityBulkPatchSerializer.serialize).toBe('function');
    });
  });

  describe('OrganizationSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof OrganizationSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof OrganizationSerializer.serialize).toBe('function');
    });
  });

  describe('OrganizationSettingSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof OrganizationSettingSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof OrganizationSettingSerializer.serialize).toBe('function');
    });
  });

  describe('MemberSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof MemberSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof MemberSerializer.serialize).toBe('function');
    });
  });

  describe('CredentialSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof CredentialSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof CredentialSerializer.serialize).toBe('function');
    });
  });

  describe('CredentialOAuthSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof CredentialOAuthSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof CredentialOAuthSerializer.serialize).toBe('function');
    });
  });

  describe('CredentialInstagramPagesSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof CredentialInstagramPagesSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof CredentialInstagramPagesSerializer.serialize).toBe(
        'function',
      );
    });
  });

  describe('BrandSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof BrandSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof BrandSerializer.serialize).toBe('function');
    });
  });

  describe('TrainingSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof TrainingSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof TrainingSerializer.serialize).toBe('function');
    });
  });

  describe('ModelSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ModelSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ModelSerializer.serialize).toBe('function');
    });
  });

  describe('VoteSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof VoteSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof VoteSerializer.serialize).toBe('function');
    });
  });

  describe('TrendSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof TrendSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof TrendSerializer.serialize).toBe('function');
    });
  });

  describe('RoleSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof RoleSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof RoleSerializer.serialize).toBe('function');
    });
  });

  describe('FolderSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof FolderSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof FolderSerializer.serialize).toBe('function');
    });
  });

  describe('PromptSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof PromptSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PromptSerializer.serialize).toBe('function');
    });
  });

  describe('TagSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof TagSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof TagSerializer.serialize).toBe('function');
    });
  });

  describe('SettingSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof SettingSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof SettingSerializer.serialize).toBe('function');
    });
  });

  describe('UserSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof UserSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof UserSerializer.serialize).toBe('function');
    });
  });

  describe('ImageSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ImageSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ImageSerializer.serialize).toBe('function');
    });
  });

  describe('ImageEditSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ImageEditSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ImageEditSerializer.serialize).toBe('function');
    });
  });

  describe('AssetSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AssetSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AssetSerializer.serialize).toBe('function');
    });
  });

  describe('IngredientSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof IngredientSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof IngredientSerializer.serialize).toBe('function');
    });
  });

  describe('IngredientBulkDeleteSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof IngredientBulkDeleteSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof IngredientBulkDeleteSerializer.serialize).toBe('function');
    });
  });

  describe('IngredientMergeSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof IngredientMergeSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof IngredientMergeSerializer.serialize).toBe('function');
    });
  });

  describe('IngredientUploadSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof IngredientUploadSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof IngredientUploadSerializer.serialize).toBe('function');
    });
  });

  describe('VideoSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof VideoSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof VideoSerializer.serialize).toBe('function');
    });
  });

  describe('VideoEditSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof VideoEditSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof VideoEditSerializer.serialize).toBe('function');
    });
  });

  describe('MusicSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof MusicSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof MusicSerializer.serialize).toBe('function');
    });
  });

  describe('MetadataSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof MetadataSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof MetadataSerializer.serialize).toBe('function');
    });
  });

  describe('AvatarSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof AvatarSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof AvatarSerializer.serialize).toBe('function');
    });
  });

  describe('PresignedUploadSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof PresignedUploadSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PresignedUploadSerializer.serialize).toBe('function');
    });
  });

  describe('PostSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof PostSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PostSerializer.serialize).toBe('function');
    });
  });

  // Regression for #1223: `PostListSerializer` was previously destructured as
  // `const { PostListSerializer } = buildSerializer('server', postListSerializerConfig)`.
  // Because `buildSerializer` keys its return object by the config `type`
  // (`post`), that destructure resolved to `undefined`, and the posts list
  // endpoint silently returned a raw `docs` array instead of a JSON:API
  // collection document — breaking the calendar client. It was never imported
  // here, so the "is defined" smoke test never caught it.
  describe('PostListSerializer (#1223)', () => {
    it('is defined (not undefined — the destructured name must match the type-derived key)', () => {
      expect(PostListSerializer).toBeTruthy();
    });

    it('should be a function (serializer)', () => {
      expect(typeof PostListSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PostListSerializer.serialize).toBe('function');
    });

    it('serializes an array into a JSON:API collection document ({ data: [...] })', () => {
      const output = PostListSerializer.serialize([
        { id: 'ckpost0000000000000000001', label: 'A', status: 'draft' },
        { id: 'ckpost0000000000000000002', label: 'B', status: 'published' },
      ]) as { data: Array<{ id: string; type: string }> };

      expect(Array.isArray(output.data)).toBe(true);
      expect(output.data).toHaveLength(2);
      expect(output.data[0]).toMatchObject({
        id: 'ckpost0000000000000000001',
        type: 'post',
      });
    });

    it('serializes an empty list into { data: [] }', () => {
      expect(PostListSerializer.serialize([])).toEqual({ data: [] });
    });
  });

  describe('LinkSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof LinkSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof LinkSerializer.serialize).toBe('function');
    });
  });

  describe('PersonaSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof PersonaSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PersonaSerializer.serialize).toBe('function');
    });
  });

  describe('ArticleSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ArticleSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ArticleSerializer.serialize).toBe('function');
    });
  });

  describe('TranscriptSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof TranscriptSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof TranscriptSerializer.serialize).toBe('function');
    });
  });

  describe('NewsSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof NewsSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof NewsSerializer.serialize).toBe('function');
    });
  });

  describe('TemplateSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof TemplateSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof TemplateSerializer.serialize).toBe('function');
    });
  });

  describe('BookmarkSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof BookmarkSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof BookmarkSerializer.serialize).toBe('function');
    });
  });

  describe('SubscriptionPreviewSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof SubscriptionPreviewSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof SubscriptionPreviewSerializer.serialize).toBe('function');
    });
  });

  describe('SubscriptionSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof SubscriptionSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof SubscriptionSerializer.serialize).toBe('function');
    });
  });

  describe('VoiceSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof VoiceSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof VoiceSerializer.serialize).toBe('function');
    });
  });

  describe('CameraMovementSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof CameraMovementSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof CameraMovementSerializer.serialize).toBe('function');
    });
  });

  describe('ElementStyleSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementStyleSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementStyleSerializer.serialize).toBe('function');
    });
  });

  describe('ElementLightingSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementLightingSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementLightingSerializer.serialize).toBe('function');
    });
  });

  describe('ElementMoodSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementMoodSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementMoodSerializer.serialize).toBe('function');
    });
  });

  describe('SceneSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof SceneSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof SceneSerializer.serialize).toBe('function');
    });
  });

  describe('SoundSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof SoundSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof SoundSerializer.serialize).toBe('function');
    });
  });

  describe('CaptionSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof CaptionSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof CaptionSerializer.serialize).toBe('function');
    });
  });

  describe('FontFamilySerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof FontFamilySerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof FontFamilySerializer.serialize).toBe('function');
    });
  });

  describe('ElementLensSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementLensSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementLensSerializer.serialize).toBe('function');
    });
  });

  describe('PresetSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof PresetSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof PresetSerializer.serialize).toBe('function');
    });
  });

  describe('ElementCameraSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementCameraSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementCameraSerializer.serialize).toBe('function');
    });
  });

  describe('ElementBlacklistSerializer', () => {
    it('should be a function (serializer)', () => {
      expect(typeof ElementBlacklistSerializer).toBe('object');
    });

    it('should have a serialize method', () => {
      expect(typeof ElementBlacklistSerializer.serialize).toBe('function');
    });
  });
});

describe('Fleet admin serializers', () => {
  const cases = [
    [
      'FleetCloudFrontInvalidationSerializer',
      FleetCloudFrontInvalidationSerializer,
    ],
    ['FleetEc2ActionResultSerializer', FleetEc2ActionResultSerializer],
    ['FleetEc2BulkActionResultSerializer', FleetEc2BulkActionResultSerializer],
    ['FleetEc2InstanceSerializer', FleetEc2InstanceSerializer],
    ['FleetHealthSerializer', FleetHealthSerializer],
    ['FleetGenerateVoiceResultSerializer', FleetGenerateVoiceResultSerializer],
    ['FleetGenerationJobSerializer', FleetGenerationJobSerializer],
    ['FleetLipSyncJobSerializer', FleetLipSyncJobSerializer],
    ['FleetLipSyncStatusSerializer', FleetLipSyncStatusSerializer],
    ['FleetPipelineCampaignSerializer', FleetPipelineCampaignSerializer],
    ['FleetPipelineStatsSerializer', FleetPipelineStatsSerializer],
    ['FleetServiceStatusSerializer', FleetServiceStatusSerializer],
    ['FleetUploadDatasetResultSerializer', FleetUploadDatasetResultSerializer],
    ['FleetVoiceSerializer', FleetVoiceSerializer],
  ] as const;

  for (const [name, serializer] of cases) {
    describe(name, () => {
      it('is defined (not undefined — type string must PascalCase to match export name)', () => {
        expect(serializer).toBeTruthy();
      });

      it('is an object', () => {
        expect(typeof serializer).toBe('object');
      });

      it('has a serialize method', () => {
        expect(typeof serializer.serialize).toBe('function');
      });
    });
  }
});
