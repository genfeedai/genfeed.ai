import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  GenerationPriority,
  TrendNotificationFrequency,
} from '@genfeedai/contracts';
import {
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  SUPPORTED_LOCALES,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSettingDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The user ID that owns these settings',
    required: true,
  })
  readonly user!: string;

  @IsString()
  @IsIn(THEME_PREFERENCES)
  @ApiProperty({
    default: DEFAULT_THEME,
    description: 'The UI appearance preference',
    enum: THEME_PREFERENCES,
    required: true,
  })
  readonly theme!: ThemePreference;

  @IsIn(SUPPORTED_LOCALES)
  @IsOptional()
  @ApiProperty({
    default: DEFAULT_LOCALE,
    description: 'The language the app UI is rendered in',
    enum: SUPPORTED_LOCALES,
    required: false,
  })
  readonly locale?: string;

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

  @IsEnum(TrendNotificationFrequency)
  @IsOptional()
  @ApiProperty({
    default: TrendNotificationFrequency.DAILY,
    description: 'Frequency of trend notifications',
    enum: TrendNotificationFrequency,
    enumName: 'TrendNotificationFrequency',
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

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether the conversation assets panel is open in agent chat',
    required: false,
  })
  readonly isAgentAssetsPanelOpen?: boolean;

  @IsEnum(GenerationPriority)
  @IsOptional()
  @ApiProperty({
    default: GenerationPriority.QUALITY,
    description:
      'Model selection priority for agent-initiated generations. Persisted as the Prisma `GenerationPriority` label; the model router receives the mapped lowercase `RouterPriority`.',
    enum: GenerationPriority,
    enumName: 'GenerationPriority',
    required: false,
  })
  readonly generationPriority?: GenerationPriority;

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
