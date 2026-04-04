import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';

export type TrendNotificationFrequency =
  | 'realtime'
  | 'hourly'
  | 'daily'
  | 'weekly';

export class CreateSettingDto {
  @IsMongoId()
  @ApiProperty({
    description: 'The user ID that owns these settings',
    required: true,
  })
  readonly user!: Types.ObjectId;

  @IsString()
  @ApiProperty({
    default: 'dark',
    description: 'The UI theme preference (light/dark)',
    required: true,
  })
  readonly theme!: string;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether the user is verified',
    required: true,
  })
  readonly isVerified!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: "Whether this is the user's first login",
    required: true,
  })
  readonly isFirstLogin!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether the sidebar menu is collapsed',
    required: true,
  })
  readonly isMenuCollapsed!: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the consolidated sidebar progress module is visible',
    required: false,
  })
  readonly isSidebarProgressVisible?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether the consolidated sidebar progress module is collapsed',
    required: false,
  })
  readonly isSidebarProgressCollapsed?: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether the user is in advanced mode',
    required: true,
  })
  readonly isAdvancedMode!: boolean;

  // Trend notification preferences
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Enable in-app trend notifications',
    required: false,
  })
  readonly isTrendNotificationsInApp?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Enable Telegram trend notifications',
    required: false,
  })
  readonly isTrendNotificationsTelegram?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Enable email trend notifications',
    required: false,
  })
  readonly isTrendNotificationsEmail?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Enable workflow completion and failure emails',
    required: false,
  })
  readonly isWorkflowNotificationsEmail?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Enable video completion and failure emails',
    required: false,
  })
  readonly isVideoNotificationsEmail?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Telegram chat ID for trend notifications',
    required: false,
  })
  readonly trendNotificationsTelegramChatId?: string;

  @IsEmail()
  @IsOptional()
  @ApiProperty({
    description: 'Email address for trend notifications',
    required: false,
  })
  readonly trendNotificationsEmailAddress?: string;

  @IsEnum(['realtime', 'hourly', 'daily', 'weekly'])
  @IsOptional()
  @ApiProperty({
    default: 'daily',
    description: 'Frequency of trend notifications',
    enum: ['realtime', 'hourly', 'daily', 'weekly'],
    required: false,
  })
  readonly trendNotificationsFrequency?: TrendNotificationFrequency;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @ApiProperty({
    default: 70,
    description: 'Minimum viral score for trend notifications',
    required: false,
  })
  readonly trendNotificationsMinViralScore?: number;

  @IsOptional()
  @IsEnum(['image', 'video', 'avatar', 'music'], { each: true })
  @ApiProperty({
    default: [],
    description: 'Content type preferences selected during onboarding',
    enum: ['image', 'video', 'avatar', 'music'],
    isArray: true,
    required: false,
  })
  readonly contentPreferences?: string[];

  @IsOptional()
  @IsString({ each: true })
  @ApiProperty({
    default: [],
    description: 'Favorite generation model keys saved for the current user',
    isArray: true,
    required: false,
    type: [String],
  })
  readonly favoriteModelKeys?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'deepseek/deepseek-chat',
    description: 'Default AI model for agent chat sessions',
    required: false,
  })
  readonly defaultAgentModel?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether the conversation assets panel is open in agent chat',
    required: false,
  })
  readonly isAgentAssetsPanelOpen?: boolean;

  @IsEnum(['quality', 'speed', 'cost', 'balanced'])
  @IsOptional()
  @ApiProperty({
    default: 'quality',
    description:
      'Model selection priority for agent-initiated generations (quality, speed, cost, balanced)',
    enum: ['quality', 'speed', 'cost', 'balanced'],
    required: false,
  })
  readonly generationPriority?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description:
      'Per-user dashboard preferences keyed by scope (organization, brand)',
    required: false,
    type: Object,
  })
  readonly dashboardPreferences?: Record<string, unknown>;
}
