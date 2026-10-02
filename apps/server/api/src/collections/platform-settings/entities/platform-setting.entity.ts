import { BaseEntity } from '@api/entities/base.entity';
import {
  type MarginInputMode,
  type PlatformSetting,
  type Prisma,
} from '@genfeedai/prisma';

export class PlatformSettingEntity
  extends BaseEntity
  implements PlatformSetting
{
  declare readonly key: string;
  declare readonly marginMultiplierGeneration: number;
  declare readonly marginMultiplierAgentChat: number;
  declare readonly marginInputMode: MarginInputMode;
  declare readonly typedDecisionProvider: string;
  declare readonly imageCompressionQuality: number;
  declare readonly paygFallbackCredits: number;
  declare readonly linkedinTrendSourceUrls: string | null;
  declare readonly agentContextCompressionModel: string | null;
  declare readonly agentContextWindowSize: number;
  declare readonly generationMaxTokens: number;
  declare readonly typedDecisionTimeoutMs: number;
  declare readonly trainingCreditsCost: number;
  declare readonly customModelCreditsCost: number;
  declare readonly replicateModelHardware: string;
  declare readonly replicateModelVisibility: 'private' | 'public';
  declare readonly replicateTrainerModel: string;
  declare readonly replicateTargetFps: number;
  declare readonly replicateTargetResolution: string;
  declare readonly klingModel: string;
  declare readonly elevenlabsModel: string | null;
  declare readonly murekaModel: string;
  declare readonly discordChannelIdDeployments: string | null;
  declare readonly discordChannelIdPosts: string | null;
  declare readonly discordChannelIdStudio: string | null;
  declare readonly discordChannelIdUsers: string | null;
  declare readonly discordChannelIdModels: string | null;
  declare readonly discordBotAvatarUrl: string | null;
  declare readonly discordWebhookNamePrefix: string | null;
  declare readonly discordWebhookReason: string | null;
  declare readonly emailFromAddress: string | null;
  declare readonly emailReplyToAddress: string | null;
  declare readonly isMediaPerceptionEnabled: boolean;
  declare readonly mediaPerceptionFrameCount: number;
  declare readonly mediaPerceptionLookbackHours: number;
  declare readonly mediaPerceptionVisionModel: string | null;
  declare readonly mediaGateVisionMode: string;
  declare readonly mediaTextGateDecisionMode: string;
  declare readonly mediaTextGateMinConfidence: number;
  declare readonly moderationMode: string;
  declare readonly moderationProvider: string;
  declare readonly moderationThresholds: Prisma.JsonValue;
  declare readonly agentAutoRoutingDecisionMode: string;
  declare readonly modelDiscoveryDecisionMode: string;
  declare readonly modelDiscoveryMinConfidence: number;
  declare readonly patternAnalyzerDecisionMode: string;
  declare readonly patternAnalyzerMinConfidence: number;
  declare readonly replyBotIntentDecisionMode: string;
  declare readonly replyBotIntentMinConfidence: number;
  declare readonly taskRoutingDecisionMode: string;
  declare readonly taskRoutingMinConfidence: number;
  declare readonly untrustedContentDecisionMode: string;
  declare readonly untrustedContentMinConfidence: number;
  declare readonly isAgentContextCompressionEnabled: boolean;
  declare readonly isAgentTokenStreamingEnabled: boolean;
  declare readonly systemEventsEnabledAt: Date | null;
  declare readonly isEmailVerificationRequired: boolean;
  declare readonly flags: Prisma.JsonValue;
  declare readonly featuredWorkflowIds: string[];
}
