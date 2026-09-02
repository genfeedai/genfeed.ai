import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { PAID_CREATIVE_PLATFORMS } from '@genfeedai/integrations/ads';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdWatchedAdvertisersQueryDto extends OmitType(BaseQueryDto, [
  'organizationId',
] as const) {
  @ApiProperty({
    description: 'Filter by advertiser handle (exact match)',
    required: false,
  })
  @IsOptional()
  @IsString()
  advertiserHandle?: string;

  @ApiProperty({
    description: 'Filter by ad platform',
    enum: PAID_CREATIVE_PLATFORMS,
    required: false,
  })
  @IsOptional()
  @IsIn(PAID_CREATIVE_PLATFORMS)
  platform?: string;
}
