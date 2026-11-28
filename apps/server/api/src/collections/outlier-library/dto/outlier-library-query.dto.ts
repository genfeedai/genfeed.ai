import { OutlierPaginationDto } from '@api/collections/outliers/dto/outlier-query.dto';
import {
  OUTLIER_LIBRARY_PLATFORMS,
  type OutlierLibraryPlatform,
  type OutlierLibraryTier,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class OutlierLibraryQueryDto extends OutlierPaginationDto {
  @ApiProperty({ enum: OUTLIER_LIBRARY_PLATFORMS, required: false })
  @IsOptional()
  @IsIn(OUTLIER_LIBRARY_PLATFORMS)
  platform?: OutlierLibraryPlatform;

  @ApiProperty({ maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiProperty({ enum: ['outlier', 'breakout'], required: false })
  @IsOptional()
  @IsIn(['outlier', 'breakout'])
  tier?: OutlierLibraryTier;
}
