import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { SocialSourcePlatform, SocialSourceType } from '@genfeedai/contracts';
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
  sourceId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  search?: string;

  /**
   * Restrict posts to containers of this type before pagination. `post` is the
   * URL/extension import container, so newer followed posts cannot consume the
   * page.
   */
  @IsEnum(SocialSourceType)
  @IsOptional()
  @ApiProperty({ enum: SocialSourceType, required: false })
  sourceType?: SocialSourceType;
}
