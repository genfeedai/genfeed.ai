import { AlertFrequency, MonitoringAlertType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class BotMonitoringSettingsDto {
  @IsEmail()
  @IsOptional()
  @ApiProperty({
    description: 'Email address for monitoring alerts',
    required: false,
  })
  alertEmail?: string;

  @IsEnum(AlertFrequency)
  @IsOptional()
  @ApiProperty({
    default: AlertFrequency.INSTANT,
    description: 'How often monitoring alerts are sent',
    enum: AlertFrequency,
    enumName: 'AlertFrequency',
    required: false,
  })
  alertFrequency?: AlertFrequency = AlertFrequency.INSTANT;

  @IsUrl()
  @IsOptional()
  @ApiProperty({
    description: 'Slack webhook URL for monitoring alerts',
    required: false,
  })
  alertSlackWebhookUrl?: string;

  @IsArray()
  @IsEnum(MonitoringAlertType, { each: true })
  @ArrayMinSize(1)
  @ApiProperty({
    description: 'Channels the bot uses to deliver alerts',
    enum: MonitoringAlertType,
    enumName: 'MonitoringAlertType',
    example: [MonitoringAlertType.IN_APP],
    type: [String],
  })
  alertTypes!: MonitoringAlertType[];

  @IsUrl()
  @IsOptional()
  @ApiProperty({
    description: 'Generic webhook URL for monitoring alerts',
    required: false,
  })
  alertWebhookUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Keywords that suppress an alert when matched',
    required: false,
    type: [String],
  })
  excludeKeywords?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Hashtags the bot monitors',
    required: false,
    type: [String],
  })
  hashtags?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ApiProperty({
    description: 'Keywords the bot monitors',
    example: ['genfeed'],
    type: [String],
  })
  keywords!: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Accounts whose mentions trigger an alert',
    required: false,
    type: [String],
  })
  mentionAccounts?: string[] = [];

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Minimum engagement count required to trigger an alert',
    minimum: 0,
    required: false,
  })
  minEngagement?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Only alert on verified accounts',
    required: false,
  })
  onlyVerified?: boolean = false;
}
