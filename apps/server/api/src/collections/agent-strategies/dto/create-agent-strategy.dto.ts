import {
  AGENT_STRATEGY_BRAND_SAFETY_MODES,
  AGENT_STRATEGY_GOAL_PROFILES,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type { AgentPolicyQualityTier } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AGENT_TYPE_VALUES } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ContentMixConfigDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Image percentage', required: false })
  imagePercent?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Video percentage', required: false })
  videoPercent?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Carousel percentage', required: false })
  carouselPercent?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Reel percentage', required: false })
  reelPercent?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Story percentage', required: false })
  storyPercent?: number;
}

export class OpportunitySourcesDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Enable trend watcher inputs', required: false })
  trendWatchersEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Enable event-based triggers', required: false })
  eventTriggersEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Enable evergreen cadence opportunities',
    required: false,
  })
  evergreenCadenceEnabled?: boolean;
}

export class BudgetPolicyCapDto {
  @IsString()
  @ApiProperty({ description: 'Platform or format key', required: true })
  key!: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Credit cap for the key', required: false })
  creditBudget?: number;
}

export class BudgetPolicyDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Monthly Genfeed credit budget',
    required: false,
  })
  monthlyCreditBudget?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Reserved budget for trends', required: false })
  reserveTrendBudget?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetPolicyCapDto)
  @IsOptional()
  @ApiProperty({
    description: 'Per-platform credit caps',
    required: false,
    type: [BudgetPolicyCapDto],
  })
  perPlatformCaps?: BudgetPolicyCapDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetPolicyCapDto)
  @IsOptional()
  @ApiProperty({
    description: 'Per-format credit caps',
    required: false,
    type: [BudgetPolicyCapDto],
  })
  perFormatCaps?: BudgetPolicyCapDto[];

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Maximum retries per opportunity',
    required: false,
  })
  maxRetriesPerOpportunity?: number;
}

export class PublishPolicyDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Allow auto-publish gating', required: false })
  autoPublishEnabled?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Minimum post score', required: false })
  minPostScore?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Minimum image score', required: false })
  minImageScore?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Allow video auto-publishing',
    required: false,
  })
  videoAutopublishEnabled?: boolean;

  @IsEnum(AGENT_STRATEGY_BRAND_SAFETY_MODES)
  @IsOptional()
  @ApiProperty({
    description: 'Brand safety mode',
    enum: AGENT_STRATEGY_BRAND_SAFETY_MODES,
    required: false,
  })
  brandSafetyMode?: (typeof AGENT_STRATEGY_BRAND_SAFETY_MODES)[number];
}

export class ReportingPolicyDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Enable daily digest reporting',
    required: false,
  })
  dailyDigestEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Enable weekly summary reporting',
    required: false,
  })
  weeklySummaryEnabled?: boolean;

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Optional report recipient user IDs',
    required: false,
    type: [String],
  })
  reportRecipientUserIds?: string[];
}

export class RankingPolicyDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Relevance score weight', required: false })
  relevanceWeight?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Freshness score weight', required: false })
  freshnessWeight?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Expected traffic score weight',
    required: false,
  })
  expectedTrafficWeight?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Historical confidence score weight',
    required: false,
  })
  historicalConfidenceWeight?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Cost efficiency score weight',
    required: false,
  })
  costEfficiencyWeight?: number;
}

export class CreateAgentStrategyDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Organization ID', required: false })
  organization?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'User ID', required: false })
  user?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Brand ID', required: false })
  brand?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Optional linked goal ID', required: false })
  goalId?: string;

  @IsIn(AGENT_TYPE_VALUES)
  @IsOptional()
  @ApiProperty({
    description: 'Agent type (drives tool subset and prompt template)',
    enum: AGENT_TYPE_VALUES,
    required: false,
  })
  agentType?: AgentType;

  @IsEnum(AgentAutonomyMode)
  @IsOptional()
  @ApiProperty({
    description: 'Autonomy mode — supervised requires manual review',
    enum: AgentAutonomyMode,
    required: false,
  })
  autonomyMode?: AgentAutonomyMode;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether strategy is active', required: false })
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether strategy is enabled (user toggle)',
    required: false,
  })
  isEnabled?: boolean;

  @IsString()
  @ApiProperty({ description: 'Strategy label', required: true })
  label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional user-facing role label',
    required: false,
  })
  displayRole?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional presentation-only team grouping label',
    required: false,
  })
  teamGroup?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional presentation-only reporting label',
    required: false,
  })
  reportsToLabel?: string;

  @IsEnum(AGENT_STRATEGY_GOAL_PROFILES)
  @IsOptional()
  @ApiProperty({
    description: 'Primary optimization goal profile',
    enum: AGENT_STRATEGY_GOAL_PROFILES,
    required: false,
  })
  goalProfile?: (typeof AGENT_STRATEGY_GOAL_PROFILES)[number];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Content topics', required: false })
  topics?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Brand voice description', required: false })
  voice?: string;

  @ValidateNested()
  @Type(() => OpportunitySourcesDto)
  @IsOptional()
  @ApiProperty({
    description: 'Opportunity source controls',
    required: false,
    type: OpportunitySourcesDto,
  })
  opportunitySources?: OpportunitySourcesDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Preferred model for this strategy',
    required: false,
  })
  model?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Quality tier override for this strategy',
    enum: ['budget', 'balanced', 'high_quality'],
    required: false,
  })
  qualityTier?: AgentPolicyQualityTier;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Target platforms', required: false })
  platforms?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Skill slugs assigned to this strategy',
    required: false,
  })
  skillSlugs?: string[];

  @ValidateNested()
  @Type(() => ContentMixConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'Content mix configuration',
    required: false,
    type: ContentMixConfigDto,
  })
  contentMix?: ContentMixConfigDto;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  @ApiProperty({ description: 'Posts per week target', required: false })
  postsPerWeek?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Enable engagement discovery', required: false })
  engagementEnabled?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Engagement search keywords', required: false })
  engagementKeywords?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Engagement reply tone', required: false })
  engagementTone?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Max engagements per day', required: false })
  maxEngagementsPerDay?: number;

  @IsEnum(AgentRunFrequency)
  @IsOptional()
  @ApiProperty({
    description: 'Run frequency',
    enum: AgentRunFrequency,
    required: false,
  })
  runFrequency?: AgentRunFrequency;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Timezone', required: false })
  timezone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Preferred posting times (HH:MM format)',
    required: false,
  })
  preferredPostingTimes?: string[];

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Daily credit budget', required: false })
  dailyCreditBudget?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description:
      'Minimum organization credits required to keep strategy active',
    required: false,
  })
  minCreditThreshold?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Weekly credit budget', required: false })
  weeklyCreditBudget?: number;

  @ValidateNested()
  @Type(() => BudgetPolicyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Monthly pacing and retry policy',
    required: false,
    type: BudgetPolicyDto,
  })
  budgetPolicy?: BudgetPolicyDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Auto-publish confidence threshold',
    required: false,
  })
  autoPublishConfidenceThreshold?: number;

  @ValidateNested()
  @Type(() => PublishPolicyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Publish gating policy',
    required: false,
    type: PublishPolicyDto,
  })
  publishPolicy?: PublishPolicyDto;

  @ValidateNested()
  @Type(() => ReportingPolicyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Reporting configuration',
    required: false,
    type: ReportingPolicyDto,
  })
  reportingPolicy?: ReportingPolicyDto;

  @ValidateNested()
  @Type(() => RankingPolicyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Opportunity ranking weights',
    required: false,
    type: RankingPolicyDto,
  })
  rankingPolicy?: RankingPolicyDto;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Next scheduled run time', required: false })
  nextRunAt?: Date;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Daily reset timestamp', required: false })
  dailyResetAt?: Date;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'Daily credit reset timestamp',
    required: false,
  })
  dailyCreditResetAt?: Date;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Monthly reset timestamp', required: false })
  monthlyResetAt?: Date;
}
