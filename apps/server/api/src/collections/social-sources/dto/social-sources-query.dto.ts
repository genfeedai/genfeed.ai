import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { SocialSourcePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class SocialSourceScopeQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  organization?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  brand?: string;
}

export class SocialSourcesQueryDto extends BaseQueryDto {
  @IsEnum(SocialSourcePlatform)
  @IsOptional()
  @ApiProperty({ enum: SocialSourcePlatform, required: false })
  platform?: SocialSourcePlatform;

  @IsBoolean()
  @IsOptional()
  @ValidateIf((o) => o.isActive !== undefined)
  @Transform(({ value }) => value === true || value === 'true')
  @ApiProperty({ required: false })
  isActive?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  search?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ default: 25, required: false })
  postsLimit?: number = 25;
}
