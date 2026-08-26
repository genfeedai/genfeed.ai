import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import type { StudioLookAssetType } from '@genfeedai/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

const STUDIO_LOOK_ASSET_TYPES = ['image', 'video'] as const;

export class StudioLooksQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: STUDIO_LOOK_ASSET_TYPES })
  @IsIn(STUDIO_LOOK_ASSET_TYPES)
  @IsOptional()
  assetType?: StudioLookAssetType;
}
