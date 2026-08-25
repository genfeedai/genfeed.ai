import { CreateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/create-ad-watched-advertiser.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAdWatchedAdvertiserDto extends PartialType(
  CreateAdWatchedAdvertiserDto,
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the watched advertiser is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
