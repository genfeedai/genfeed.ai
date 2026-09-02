import { MonitoredAccountFiltersDto } from '@api/collections/monitored-accounts/dto/monitored-account-filters.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ReplyBotPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMonitoredAccountDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Credential used to access the monitored platform',
    required: false,
  })
  credentialId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Reply bot configuration using this account',
    required: false,
  })
  botConfigId?: string;

  @IsEnum(ReplyBotPlatform)
  @ApiProperty({
    description: 'Platform containing the account',
    enum: ReplyBotPlatform,
    enumName: 'ReplyBotPlatform',
  })
  platform!: ReplyBotPlatform;

  @IsString()
  @ApiProperty({
    description: 'Platform-specific account identifier',
  })
  externalId!: string;

  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Account username to monitor (without @)',
    example: 'elonmusk',
  })
  username!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @ApiProperty({
    description: 'Account display name',
    required: false,
  })
  displayName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Account avatar URL',
    required: false,
  })
  avatarUrl?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Current follower count',
    minimum: 0,
    required: false,
  })
  followersCount?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Account biography',
    required: false,
  })
  bio?: string;

  @ValidateNested()
  @Type(() => MonitoredAccountFiltersDto)
  @IsOptional()
  @ApiProperty({
    description: 'Filter configuration for monitored content',
    required: false,
    type: MonitoredAccountFiltersDto,
  })
  filters?: MonitoredAccountFiltersDto;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether monitoring is active',
    required: false,
  })
  isActive?: boolean;
}
