import { MonitoredAccountFiltersDto } from '@api/collections/monitored-accounts/dto/monitored-account-filters.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateMonitoredAccountDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization that owns this monitored account',
    required: false,
  })
  organization?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand this monitored account is scoped to',
    required: false,
  })
  brand?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'User that created this monitored account',
    required: false,
  })
  user?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Credential used for Twitter API access',
    required: false,
  })
  credential?: Types.ObjectId;

  @IsString()
  @MaxLength(15)
  @ApiProperty({
    description: 'Twitter username to monitor (without @)',
    example: 'elonmusk',
  })
  twitterUsername!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Twitter user ID (will be fetched if not provided)',
    required: false,
  })
  twitterUserId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @ApiProperty({
    description: 'Twitter display name',
    required: false,
  })
  twitterDisplayName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Twitter avatar URL',
    required: false,
  })
  twitterAvatarUrl?: string;

  @ValidateNested()
  @Type(() => MonitoredAccountFiltersDto)
  @IsOptional()
  @ApiProperty({
    description: 'Filter configuration for tweets',
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
