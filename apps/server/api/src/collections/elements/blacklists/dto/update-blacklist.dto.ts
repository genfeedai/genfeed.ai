import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementBlacklistDto extends PartialType(
  CreateElementBlacklistDto,
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the blacklist is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
