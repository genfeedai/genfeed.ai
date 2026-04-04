import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateWatchlistDto extends PartialType(CreateWatchlistDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the watchlist is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
