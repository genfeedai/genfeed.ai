import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { SocialSourcePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class SourcePostsQueryDto extends BaseQueryDto {
  @IsEnum(SocialSourcePlatform)
  @IsOptional()
  @ApiProperty({ enum: SocialSourcePlatform, required: false })
  platform?: SocialSourcePlatform;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  source?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  search?: string;
}
