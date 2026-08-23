import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { OmitType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class XAdWatchedAdvertisersQueryDto extends OmitType(BaseQueryDto, [
  'organizationId',
] as const) {
  @ApiProperty({
    description: 'Filter by advertiser handle (exact match)',
    required: false,
  })
  @IsOptional()
  @IsString()
  advertiserHandle?: string;
}
