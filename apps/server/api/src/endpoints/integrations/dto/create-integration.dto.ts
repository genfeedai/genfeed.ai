import { IntegrationPlatform } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class IntegrationConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUserIds?: string[];

  @IsOptional()
  @IsString()
  defaultWorkflow?: string;

  /**
   * Explicit opt-out of the allowlist. An empty `allowedUserIds` denies every
   * platform user; only this flag opens the bot to everyone.
   */
  @IsOptional()
  @IsBoolean()
  isOpenToAllUsers?: boolean;

  @IsOptional()
  @IsBoolean()
  webhookMode?: boolean;

  @IsOptional()
  @IsString()
  appToken?: string; // For Slack socket mode
}

export class CreateIntegrationDto {
  @IsEnum(IntegrationPlatform)
  @ApiProperty({ enum: IntegrationPlatform, enumName: 'IntegrationPlatform' })
  platform!: IntegrationPlatform;

  @IsString()
  botToken!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntegrationConfigDto)
  config?: IntegrationConfigDto;
}
