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
}
