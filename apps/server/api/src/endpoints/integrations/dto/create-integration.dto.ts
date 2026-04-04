import { IntegrationPlatform } from '@genfeedai/enums';
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
