import { CreateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/create-x-ad-watched-advertiser.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateXAdWatchedAdvertiserDto extends PartialType(
  CreateXAdWatchedAdvertiserDto,
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the watched advertiser is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
