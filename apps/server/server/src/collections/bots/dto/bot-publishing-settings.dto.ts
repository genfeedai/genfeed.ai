import { ContentSourceType, PublishingFrequency } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BotPublishingSettingsDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Prompt used when generating content with AI',
    required: false,
  })
  aiPrompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Signature appended to each published post',
    required: false,
  })
  appendSignature?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Hashtags automatically added to each post',
    required: false,
    type: [String],
  })
  autoHashtags?: string[] = [];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Identifier of the content queue to publish from',
    required: false,
  })
  contentQueueId?: string;

  @IsEnum(ContentSourceType)
  @IsOptional()
  @ApiProperty({
    default: ContentSourceType.QUEUE,
    description: 'Where publishing content is sourced from',
    enum: ContentSourceType,
    enumName: 'ContentSourceType',
    required: false,
  })
  contentSourceType?: ContentSourceType = ContentSourceType.QUEUE;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Custom cron expression when frequency is custom',
    required: false,
  })
  customCronExpression?: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  @ApiProperty({
    default: [0, 1, 2, 3, 4, 5, 6],
    description: 'Days of week the bot publishes (0 = Sunday)',
    required: false,
    type: [Number],
  })
  daysOfWeek?: number[] = [0, 1, 2, 3, 4, 5, 6];

  @IsEnum(PublishingFrequency)
  @IsOptional()
  @ApiProperty({
    default: PublishingFrequency.DAILY,
    description: 'How often the bot publishes',
    enum: PublishingFrequency,
    enumName: 'PublishingFrequency',
    required: false,
  })
  frequency?: PublishingFrequency = PublishingFrequency.DAILY;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @ApiProperty({
    default: 5,
    description: 'Maximum posts published per day',
    maximum: 50,
    minimum: 1,
    required: false,
  })
  maxPostsPerDay?: number = 5;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Times of day the bot publishes (HH:mm)',
    required: false,
    type: [String],
  })
  scheduledTimes?: string[] = [];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Identifier of the template to publish from',
    required: false,
  })
  templateId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'UTC',
    description: 'IANA timezone the publishing schedule is evaluated in',
    required: false,
  })
  timezone?: string = 'UTC';
}
