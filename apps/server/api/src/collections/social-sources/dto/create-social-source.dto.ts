import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { SocialSourcePlatform, SocialSourceType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSocialSourceDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  credential?: string;

  @IsEnum(SocialSourcePlatform)
  @ApiProperty({ enum: SocialSourcePlatform, enumName: 'SocialSourcePlatform' })
  platform!: SocialSourcePlatform;

  @IsEnum(SocialSourceType)
  @IsOptional()
  @ApiProperty({
    default: SocialSourceType.ACCOUNT,
    enum: SocialSourceType,
    enumName: 'SocialSourceType',
    required: false,
  })
  sourceType?: SocialSourceType;

  @IsString()
  @MaxLength(128)
  @ApiProperty({ description: 'Platform handle, with or without @' })
  handle!: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  @ApiProperty({ required: false })
  displayName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  profileUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  bio?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  externalId?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  followersCount?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: true, required: false })
  isActive?: boolean;
}
